"""Deterministic demo intelligence engine.

Used when no AI key is configured (and as a per-batch fallback when the AI
provider fails).  It applies transparent linguistic heuristics, so the same
requirement always yields the same analysis and the same test cases.
Everything it produces is labelled ``source="demo"``.
"""

from __future__ import annotations

import hashlib
import re

from app.services.ai.base import (
    Analysis,
    ChangeBrief,
    GeneratedTest,
    RequirementInput,
    TestContext,
)

_CATEGORY_RULES: list[tuple[str, str]] = [
    ("Security", r"authenticat|password|encrypt|authori[sz]|\brole|permission|log ?in|sign[- ]in|token|"
                 r"session|two-factor|2fa|mfa|otp|access control|tls|ssl|lock(ed|out)?\b|credential"),
    ("Performance", r"within \d+|response time|latency|throughput|concurrent|per second|load time|"
                    r"\b\d+\s?(ms|milliseconds|seconds|sec)\b|scal(e|ab)"),
    ("Reliability", r"availab|uptime|99\.\d|backup|recover|failover|redundan|fault|disaster|retry"),
    ("Compliance", r"gdpr|pci|hipaa|sox|regulat|complian|legal|consent|audit trail|retention polic"),
    ("Usability", r"user-friendly|intuitive|accessib|wcag|screen reader|responsive|keyboard|"
                  r"mobile device|easy to|\busab|language|locali[sz]|browser"),
    ("Integration", r"\bapi\b|third[- ]party|integrat|webhook|external|gateway|synchroni[sz]|import from|erp|crm"),
    ("Notification", r"notif|e-?mail|\bsms\b|push message|alert"),
    ("Reporting", r"report|dashboard|analytic|chart|statement|summary view|kpi"),
    ("Data", r"\bstore|retain|database|export|archiv|record|persist|csv|history|delete .*data"),
]

_VAGUE_TERMS: list[tuple[str, float, str]] = [
    (r"\b(fast|quick(ly)?|rapid(ly)?|responsive|promptly|immediately|real[- ]time)\b", 0.35,
     "Define a measurable time limit (for example ≤ 2 seconds at the 95th percentile)."),
    (r"\b(user[- ]friendly|easy|easily|intuitive|simple|convenient)\b", 0.35,
     "Replace subjective usability wording with measurable criteria (steps to complete, task success rate)."),
    (r"\b(appropriate|adequate|sufficient|reasonable|suitable|proper(ly)?)\b", 0.3,
     "State the exact rule that makes the behaviour 'appropriate'."),
    (r"\b(etc\.?|and so on|such as|including but not limited to)", 0.3,
     "Enumerate the complete list instead of open-ended examples."),
    (r"\b(as needed|as required|if necessary|where possible|when possible|if applicable)\b", 0.35,
     "Specify the exact conditions that trigger this behaviour."),
    (r"\b(approximately|about|around|nearly|several|some|many|few|various|multiple)\b", 0.25,
     "Replace approximate quantities with exact values or ranges."),
    (r"\b(robust|flexible|efficient(ly)?|seamless(ly)?|state[- ]of[- ]the[- ]art|optimal|modern|high[- ]quality)\b", 0.3,
     "Express the quality attribute as a verifiable metric."),
    (r"\band/or\b", 0.3, "Clarify whether both conditions or only one is required."),
    (r"\b(tbd|tbc|to be determined|to be confirmed)\b", 0.6, "Resolve the open placeholder before implementation."),
    (r"\b(minimi[sz]e|maximi[sz]e|optimi[sz]e)\b", 0.3, "Provide a target value instead of an open-ended goal."),
    (r"\b(normally|usually|typically|generally|ideally)\b", 0.25, "Define the exceptions explicitly."),
    (r"\bsupport(s|ed)?\b", 0.15, "Describe the concrete, observable behaviour behind 'support'."),
]

_SYSTEM_ACTORS = r"system|application|platform|portal|service|api|server|module|software|app|solution|backend"
_MODAL = re.compile(
    r"\b(shall|must|should|will|may|could|can|is required to|are required to|needs to|need to|has to|have to)\b",
    re.I,
)
_PERSON = re.compile(
    r"\b(users?|customers?|admins?|administrators?|drivers?|dispatchers?|managers?|patients?|clinicians?|staff|"
    r"operators?|teams?|agents?|members?|employees?|approvers?|reviewers?|owners?|visitors?|guests?|tellers?)\b",
    re.I,
)
_BOUNDARY_WORDS = {"after", "within", "when", "if", "using", "via", "through", "for", "by", "before", "with",
                   "in", "on", "from", "under", "while", "so", "including", "until", "upon", "where", "between"}
_NUMBER_UNIT = re.compile(
    r"(\d+(?:[.,]\d+)?)\s?(?:[a-z-]+\s){0,3}?(%|ms|milliseconds?|seconds?|secs?|minutes?|mins?|hours?|days?|months?|years?|"
    r"characters?|chars?|attempts?|times|users?|requests?|records?|mb|gb|kb|items?|transactions?|digits?)",
    re.I,
)
_STOP_TAIL = {"a", "an", "the", "of", "to", "for", "and", "or", "with", "in", "on", "by", "after", "at", "from", "within", "that"}
_INPUT_WORDS = re.compile(r"\b(enter|input|submit|upload|form|field|register|create|update|edit|save|search)\b", re.I)


def _seed(text: str) -> int:
    return int(hashlib.sha256(text.encode()).hexdigest()[:8], 16)


def _sentence(text: str) -> str:
    text = text.strip()
    return text if text.endswith((".", "!", "?")) else text + "."


def split_actor_action(text: str) -> tuple[str, str, str]:
    """Return (actor, modal, action) for a requirement sentence."""
    m = _MODAL.search(text)
    if not m:
        return "system", "shall", text.rstrip(".")
    actor = text[: m.start()].strip(" ,") or "system"
    action = text[m.end():].strip().rstrip(".")
    action = re.sub(r"^(be able to|provide the ability to|allow (the )?users? to)\s+", "", action, flags=re.I)
    actor = re.sub(r"^(the|a|an)\s+", "", actor, flags=re.I)
    return actor, m.group(1).lower(), action


def actor_kind(actor: str) -> str:
    """'system' for the product itself, 'person' for a user role, otherwise 'thing'."""
    a = actor.lower().strip()
    if not a or re.fullmatch(rf"(the\s+)?({_SYSTEM_ACTORS})", a):
        return "system"
    if _PERSON.search(a) and not re.search(r"session|interface|account|data|page|record", a):
        return "person"
    if re.search(_SYSTEM_ACTORS, a) and len(a.split()) <= 2:
        return "system"
    return "thing"


def is_system_actor(actor: str) -> bool:
    return actor_kind(actor) == "system"


def singular(role: str) -> str:
    words = role.lower().split()
    if words and words[-1].endswith("s") and not words[-1].endswith("ss"):
        words[-1] = words[-1][:-1]
    return " ".join(words)


def article(word: str) -> str:
    return "an" if word[:1].lower() in "aeiou" else "a"


def make_title(text: str) -> str:
    actor, _, action = split_actor_action(text)
    action = re.sub(r"^(allow|enable|permit)\s+(?:[\w-]+\s+){1,3}?to\s+", "", action, flags=re.I)
    action = re.sub(r"^(be able to|provide|allow|enable|ensure that|ensure)\s+", "", action, flags=re.I)
    action = re.sub(r"^be\s+", "", action, flags=re.I)
    words = [w for w in re.split(r"\s+", action) if w and w.lower() not in {"a", "an", "the"}]
    cut = next((i for i, w in enumerate(words) if i >= 2 and w.lower().strip(",") in _BOUNDARY_WORDS), None)
    comma = next((i + 1 for i, w in enumerate(words) if i >= 2 and w.endswith(",")), None)
    if comma is not None and (cut is None or comma < cut):
        cut = comma
    clipped = words[:cut] if cut is not None and cut <= 7 else words[:7]
    while clipped and clipped[-1].lower().strip(",;:") in _STOP_TAIL:
        clipped.pop()
    phrase = " ".join(clipped).strip(",;: ")
    if actor_kind(actor) == "thing":
        subject = re.sub(r"^(all|each|every|any)\s+", "", actor, flags=re.I)
        phrase = f"{subject} {phrase}" if len(subject.split()) <= 4 else phrase
    title = phrase or text[:60]
    return title[0].upper() + title[1:]


def categorize(text: str) -> str:
    best, best_hits = "Functional", 0
    for category, pattern in _CATEGORY_RULES:
        hits = len(re.findall(pattern, text, re.I))
        if hits > best_hits:
            best, best_hits = category, hits
    return best


def ambiguity(text: str, modal: str) -> tuple[float, list[str], list[str]]:
    score, notes, fixes = 0.0, [], []
    for pattern, weight, fix in _VAGUE_TERMS:
        found = re.search(pattern, text, re.I)
        if found:
            score += weight
            notes.append(f"Vague term “{found.group(0)}”")
            fixes.append(fix)
    if modal in {"should", "may", "will", "could", "can"}:
        score += 0.1
        notes.append(f"Weak obligation verb “{modal}”")
        fixes.append("Confirm whether this is mandatory (use “shall”) or optional.")
    if re.search(r"\bshall be \w+ed\b", text, re.I) and not re.search(r"\bby (the )?\w+", text, re.I):
        score += 0.05
    return min(score, 1.0), notes, fixes


def priority_for(text: str, modal: str, category: str, hint: str | None) -> str:
    if hint:
        return hint
    if re.search(r"\b(critical|mandatory|immediately|at all times|never)\b", text, re.I):
        return "Critical"
    if modal in {"shall", "must", "is required to", "are required to", "has to", "have to", "needs to", "need to"}:
        return "Critical" if category in {"Security", "Compliance"} and modal == "must" else "High"
    if modal in {"should", "will"}:
        return "Medium"
    return "Low"  # may / could / can


def complexity_for(text: str) -> str:
    points = len(text.split()) / 18
    points += len(re.findall(r"\b(and|or)\b|,", text, re.I)) * 0.35
    points += len(re.findall(r"\b(if|when|unless|except|while|until|after|before|upon)\b", text, re.I)) * 0.6
    points += 1 if re.search(r"integrat|third[- ]party|synchroni|concurren|encrypt|real[- ]time", text, re.I) else 0
    if points >= 3.2:
        return "High"
    return "Medium" if points >= 1.6 else "Low"


def risk_for(category: str, complexity: str, amb: float, priority: str) -> str:
    score = {"Security": 3, "Compliance": 3, "Performance": 2, "Reliability": 2,
             "Integration": 2, "Data": 2}.get(category, 1)
    score += 1 if complexity == "High" else 0
    score += 1 if amb >= 0.4 else 0
    score += 1 if priority == "Critical" else 0
    return ["Low", "Low", "Medium", "High", "Critical", "Critical"][min(score, 5)]


def acceptance_criteria(text: str, category: str) -> list[str]:
    actor, _, action = split_actor_action(text)
    action_clean = action[0].lower() + action[1:] if action else action
    kind = actor_kind(actor)
    if kind == "system":
        noun = actor.lower() or "system"
        criteria = [
            f"Given the {noun} is operating normally, when the triggering condition occurs, "
            f"then the {noun} must {action_clean}."
        ]
    elif kind == "person":
        role = singular(actor)
        criteria = [
            f"Given {article(role)} {role} is signed in with the required permissions, when they "
            f"{action_clean}, then the operation completes successfully and the result is visible to them."
        ]
    else:
        noun = actor[0].lower() + actor[1:]
        criteria = [
            f"Given the build under test, when the behaviour of {noun} is exercised under normal conditions, "
            f"then {noun} must {action_clean}."
        ]

    measures = list(_NUMBER_UNIT.finditer(text))
    timed = [m for m in measures if re.match(r"ms|millisecond|second|sec\b|secs", m.group(2).lower())]
    counted = [m for m in measures if not re.match(r"ms|millisecond|second|sec|minute|min|hour|day|month|year|%",
                                                   m.group(2).lower())]
    if category == "Performance" and timed:
        value, unit = timed[0].group(1), timed[0].group(2).lower()
        criteria.append(
            f"Given representative production load, when response time is measured, then the operation completes "
            f"within {value} {unit} for the stated share of requests."
        )
    elif counted:
        value, unit = counted[0].group(1), counted[0].group(2).lower()
        criteria.append(
            f"Given inputs at the boundary of {value} {unit}, when they are applied, then the value {value} is handled "
            f"exactly as specified and values on either side behave accordingly."
        )
    elif measures:
        value, unit = measures[0].group(1), measures[0].group(2).lower()
        criteria.append(
            f"Given a controlled test clock or measurement window, when {value} {unit} elapse or are reached, "
            f"then the specified behaviour is triggered precisely at that threshold."
        )

    negative = {
        "Security": "Given an unauthenticated or unauthorised user, when they attempt the same operation, then access is denied, "
                    "no sensitive data is revealed and the attempt is logged.",
        "Performance": "Given peak load conditions, when the operation is executed, then the system degrades gracefully without errors or data loss.",
        "Reliability": "Given a component failure, when the operation is in progress, then the system recovers without data loss and reports the incident.",
        "Integration": "Given the external service is unavailable or returns an error, when the integration is invoked, then the failure is handled "
                       "gracefully, retried or queued, and surfaced to operators.",
        "Notification": "Given the recipient has no valid contact details, when a notification is triggered, then the failure is recorded and does "
                        "not block the originating transaction.",
        "Compliance": "Given a request that violates the applicable policy, when it is processed, then it is rejected and an audit entry is created.",
    }.get(category)
    if negative is None and _INPUT_WORDS.search(text):
        negative = ("Given invalid, missing or malformed input, when it is submitted, then the system rejects it with a clear validation "
                    "message and no partial data is saved.")
    if negative is None:
        negative = "Given the preconditions are not met, when the action is attempted, then the system prevents it and informs the user why."
    criteria.append(negative)
    return criteria


class DemoProvider:
    source = "demo"
    name = "SpecLens heuristic engine (demo mode)"

    def analyze(self, items: list[RequirementInput]) -> list[Analysis]:
        return [self.analyze_one(item) for item in items]

    def analyze_one(self, item: RequirementInput) -> Analysis:
        text = item.text
        _, modal, _ = split_actor_action(text)
        category = categorize(text)
        amb, notes, fixes = ambiguity(text, modal)
        priority = priority_for(text, modal, category, item.priority_hint)
        complexity = complexity_for(text)
        risk = risk_for(category, complexity, amb, priority)
        testable = amb < 0.6 and not re.search(r"\btbd\b|to be determined", text, re.I)
        rationale = (
            f"Classified as {category} from domain vocabulary; obligation verb “{modal}” sets {priority} priority; "
            f"{complexity.lower()} complexity from clause structure."
        )
        return Analysis(
            title=make_title(text),
            category=category,
            priority=priority,
            risk=risk,
            complexity=complexity,
            testable=testable,
            ambiguity_score=round(amb, 2),
            ambiguity_notes="; ".join(notes),
            clarification=" ".join(dict.fromkeys(fixes)),
            rationale=rationale,
            acceptance_criteria=acceptance_criteria(text, category),
        )

    # ------------------------------------------------------------------ tests
    def generate_tests(self, ctx: TestContext, types: list[str], per_type: int) -> list[GeneratedTest]:
        out: list[GeneratedTest] = []
        for test_type in types:
            for variant in range(max(1, per_type)):
                out.append(self._build(ctx, test_type, variant))
        return out

    def _test_data(self, ctx: TestContext, test_type: str, variant: int) -> str:
        text = ctx.text.lower()
        seed = _seed(ctx.text) + variant
        users = ["qa.analyst01@example.com", "priya.test@example.com", "tester.ops@example.com"]
        user = users[seed % len(users)]
        parts: list[str] = []
        if re.search(r"log ?in|sign[- ]in|password|account|authenticat", text):
            parts.append(f"User: {user}")
            parts.append("Password: Valid#2026" if test_type in {"positive", "functional", "regression"} else "Password: wrong-pass-123")
        if re.search(r"amount|payment|transfer|balance|price|fee|invoice", text):
            parts.append("Amount: 1,250.00 INR" if test_type == "positive" else "Amount: -10.00 / 0.00 / 10,000,001.00")
        if re.search(r"upload|file|attachment|document", text):
            parts.append("File: sample_spec.pdf (2 MB)" if test_type == "positive" else "File: corrupted.pdf, 0-byte file, 60 MB file")
        if re.search(r"date|schedule|expiry|deadline", text):
            parts.append("Date: 2026-03-31; boundary 2026-12-31")
        num = _NUMBER_UNIT.search(ctx.text)
        if num and test_type == "edge_case":
            try:
                n = float(num.group(1).replace(",", ""))
                fmt = (lambda x: str(int(x))) if n.is_integer() else (lambda x: f"{x:g}")
                parts.append(f"Boundary values: {fmt(n - 1)}, {fmt(n)}, {fmt(n + 1)} {num.group(2)}")
            except ValueError:
                pass
        if not parts:
            parts.append("Representative valid dataset" if test_type in {"positive", "functional", "regression"}
                         else "Empty, null, maximum-length and special-character inputs")
        return "; ".join(parts)

    def _build(self, ctx: TestContext, test_type: str, variant: int) -> GeneratedTest:
        actor, _, action = split_actor_action(ctx.text)
        kind = actor_kind(actor)
        role = singular(actor) if kind == "person" else "authorised user"
        area = re.sub(r"^[\d.]+\s*", "", ctx.section.split("›")[-1].strip()) if ctx.section else ctx.title
        criteria = ctx.acceptance_criteria
        neg_idx = len(criteria) - 1 if criteria else None
        measure = _NUMBER_UNIT.search(ctx.text)
        num_idx = 1 if len(criteria) >= 3 else None
        suffix = f" (variant {variant + 1})" if variant else ""
        base_pre = [f"Build containing {ctx.code} is deployed to the test environment",
                    f"Test account with the {role} role is available"]
        setup = f"Sign in as {article(role)} {role}" if kind == "person" or ctx.category == "Security" \
            else "Bring the system to a clean, known baseline state"
        if kind == "person":
            act_step = f"As the {role}, {action}"
        elif kind == "system":
            act_step = f"Trigger the condition under which the system must {action}"
        else:
            act_step = f"Exercise the behaviour: {actor[0].lower() + actor[1:]} must {action}"

        def then_of(idx: int | None, fallback: str) -> str:
            if idx is not None and 0 <= idx < len(criteria):
                m = re.search(r"\bthen\b\s+(.*)$", criteria[idx], re.I)
                if m:
                    text = m.group(1).strip()
                    return text[0].upper() + text[1:]
            return fallback

        if test_type == "positive":
            return GeneratedTest(
                title=f"Verify: {ctx.title}{suffix}",
                scenario=f"Confirm the requirement holds with valid inputs — {_sentence(ctx.text)}",
                preconditions=base_pre,
                steps=[setup, f"Open the {area} area", act_step, "Record the system response and capture evidence"],
                expected_result=then_of(0, f"The behaviour matches the requirement: {_sentence(ctx.text)}"),
                test_type="positive", priority=ctx.priority,
                test_data=self._test_data(ctx, "positive", variant), criterion_index=0 if criteria else None,
            )
        if test_type == "negative":
            if ctx.category == "Security":
                steps = ["Sign out, or sign in with an account lacking the required role",
                         f"Attempt the operation covered by {ctx.code}", "Inspect the response, UI message and audit log"]
            else:
                steps = [setup, f"Open the {area} area", "Provide invalid, missing or out-of-range data for the operation",
                         "Submit and observe validation feedback and persisted data"]
            return GeneratedTest(
                title=f"Invalid conditions: {ctx.title}{suffix}",
                scenario="Verify the system handles invalid or unauthorised conditions safely.",
                preconditions=base_pre, steps=steps,
                expected_result=then_of(neg_idx, "The operation is rejected with a clear message and no data is changed."),
                test_type="negative",
                priority="High" if ctx.priority in {"High", "Critical"} else ctx.priority,
                test_data=self._test_data(ctx, "negative", variant), criterion_index=neg_idx,
            )
        if test_type == "edge_case":
            limit = f"{measure.group(1)} {measure.group(2)}" if measure else "the documented limits"
            return GeneratedTest(
                title=f"Boundary values: {ctx.title}{suffix}",
                scenario=f"Exercise values just inside, exactly at and just beyond {limit}.",
                preconditions=base_pre + ["Boundary dataset prepared"],
                steps=[setup, f"Apply a value just inside {limit} and record the result",
                       f"Apply a value exactly at {limit} and record the result",
                       f"Apply a value just beyond {limit} and record the result"],
                expected_result=then_of(num_idx if measure else None,
                                        f"Behaviour switches exactly at {limit}; no errors occur on either side of the boundary."),
                test_type="edge_case", priority=ctx.priority,
                test_data=self._test_data(ctx, "edge_case", variant),
                criterion_index=num_idx if measure else (0 if criteria else None),
            )
        if test_type == "regression":
            return GeneratedTest(
                title=f"Regression: {ctx.title}{suffix}",
                scenario="Re-verify the behaviour after related code or specification changes.",
                preconditions=base_pre + ["Previous release baseline evidence is available"],
                steps=["Deploy the new build to the test environment", setup, act_step,
                       "Compare the result with the baseline evidence"],
                expected_result="Behaviour matches the current requirement text and the previous baseline; no regressions.",
                test_type="regression", priority="Medium",
                test_data=self._test_data(ctx, "regression", variant), criterion_index=0 if criteria else None,
            )
        return GeneratedTest(
            title=f"End-to-end: {ctx.title}{suffix}",
            scenario=f"Validate the complete {area.lower()} workflow from start to finish.",
            preconditions=base_pre + ["Dependent services and integrations are available"],
            steps=[setup, f"Navigate to {area}", act_step,
                   "Verify downstream records, notifications and audit entries"],
            expected_result="The workflow completes and every dependent record reflects the change consistently.",
            test_type="functional", priority=ctx.priority,
            test_data=self._test_data(ctx, "functional", variant), criterion_index=0 if criteria else None,
        )

    # ---------------------------------------------------------------- changes
    def summarize_changes(self, document: str, changes: list[ChangeBrief]) -> str:
        counts = {k: sum(1 for c in changes if c.change_type == k) for k in ("added", "modified", "removed")}
        severe = [c for c in changes if c.severity in {"critical", "high"}]
        tests = sum(c.affected_tests for c in changes)
        if not any(counts.values()):
            return f"No requirement-level changes detected in {document}. Existing test coverage remains valid."
        parts = [
            f"{document}: {counts['added']} added, {counts['modified']} modified and {counts['removed']} removed requirement(s)."
        ]
        if severe:
            codes = ", ".join(c.code for c in severe[:4] if c.code)
            parts.append(f"{len(severe)} high-impact change(s){' (' + codes + ')' if codes else ''} need review first.")
        if tests:
            parts.append(f"{tests} existing test case(s) are affected and were flagged for review or marked obsolete.")
        if counts["added"]:
            parts.append("New requirements have no test coverage yet — generate tests to close the gap.")
        return " ".join(parts)
