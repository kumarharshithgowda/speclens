"""Prompt templates for the OpenAI-compatible provider."""

from __future__ import annotations

import json

from app.services.ai.base import CATEGORIES, TEST_TYPES, ChangeBrief, RequirementInput, TestContext

ANALYZE_SYSTEM = f"""You are a principal requirements engineer reviewing a software specification.
For every requirement you receive, produce a rigorous, concise analysis.

Return ONLY a JSON object of the form {{"results": [ ... ]}} with exactly one result per input,
in the same order, each containing:
- "index": the input index (integer)
- "title": a short imperative title, max 8 words
- "category": one of {CATEGORIES}
- "priority": one of ["Low","Medium","High","Critical"]
- "risk": one of ["Low","Medium","High","Critical"] (business/technical risk if implemented wrongly)
- "complexity": one of ["Low","Medium","High"]
- "testable": true if an objective pass/fail test can be written as stated
- "ambiguity_score": number from 0 (precise) to 1 (very ambiguous)
- "ambiguity_notes": short explanation of vague or missing parts ("" if none)
- "clarification": a concrete suggested rewrite or question for the author ("" if none)
- "rationale": one sentence explaining the classification
- "acceptance_criteria": 2-4 criteria in Given/When/Then form
Use a priority hint when one is supplied. Do not wrap the JSON in markdown."""


def analyze_user(items: list[RequirementInput]) -> str:
    payload = [
        {"index": i, "text": it.text, "section": it.section, "priority_hint": it.priority_hint}
        for i, it in enumerate(items)
    ]
    return "Analyse these requirements:\n" + json.dumps(payload, ensure_ascii=False, indent=1)


TESTGEN_SYSTEM = f"""You are a senior QA engineer writing executable manual test cases.
Return ONLY a JSON object {{"test_cases": [ ... ]}}. Each test case contains:
- "title": action-oriented title
- "scenario": one-sentence description of what is verified
- "preconditions": list of strings
- "steps": list of concrete, numbered-free step strings
- "expected_result": observable expected outcome
- "test_type": one of {TEST_TYPES}
- "priority": one of ["Low","Medium","High","Critical"]
- "test_data": concrete sample data (string)
- "criterion_index": 0-based index of the acceptance criterion this test verifies, or null
Generate exactly the requested number of test cases per requested type. Be specific to the
requirement; never produce generic filler. Do not wrap the JSON in markdown."""


def testgen_user(ctx: TestContext, types: list[str], per_type: int) -> str:
    criteria = "\n".join(f"  [{i}] {c}" for i, c in enumerate(ctx.acceptance_criteria)) or "  (none)"
    return (
        f"Requirement {ctx.code}: {ctx.title}\n"
        f"Text: {ctx.text}\n"
        f"Category: {ctx.category}; Priority: {ctx.priority}; Section: {ctx.section or 'n/a'}\n"
        f"Acceptance criteria:\n{criteria}\n\n"
        f"Generate {per_type} test case(s) for each of these types: {', '.join(types)}."
    )


SUMMARY_SYSTEM = """You are a QA lead. Summarise the impact of a specification revision for the
test team in 2-4 plain sentences: what changed, which changes are riskiest, and what testing
action is needed. Return ONLY a JSON object {"summary": "..."}."""


def summary_user(document: str, changes: list[ChangeBrief]) -> str:
    rows = [c.model_dump() for c in changes if c.change_type != "unchanged"][:40]
    return f"Document: {document}\nChanges:\n" + json.dumps(rows, ensure_ascii=False, indent=1)
