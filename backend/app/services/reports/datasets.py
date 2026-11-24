"""Report datasets: each returns (title, summary pairs, columns, rows)."""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import ChangeSet, Document, Project, Requirement, TestCase
from app.services.traceability import build_matrix

SOURCE_LABEL = {"ai": "AI", "demo": "Demo engine", "manual": "Manual", "mixed": "AI + Demo"}


@dataclass
class Dataset:
    title: str
    subtitle: str
    columns: list[str]
    rows: list[list]
    summary: list[tuple[str, str]] = field(default_factory=list)
    widths: list[float] | None = None  # relative column widths for PDF


def _scope(db: Session, project_id: int | None) -> str:
    if project_id:
        p = db.get(Project, project_id)
        return p.name if p else "Unknown project"
    return "All projects"


def requirements_dataset(db: Session, project_id: int | None) -> Dataset:
    stmt = (select(Requirement).where(Requirement.status == "active")
            .options(selectinload(Requirement.criteria), selectinload(Requirement.test_cases),
                     selectinload(Requirement.document))
            .order_by(Requirement.project_id, Requirement.id))
    if project_id:
        stmt = stmt.where(Requirement.project_id == project_id)
    reqs = db.scalars(stmt).all()
    rows = []
    for r in reqs:
        tests = [t for t in r.test_cases if t.status != "obsolete"]
        rows.append([
            r.code, r.external_id or "", r.title, r.description, r.category, r.priority, r.risk, r.complexity,
            "Yes" if r.testable else "No", f"{round(r.ambiguity_score * 100)}%", r.clarification,
            "\n".join(f"{c.code}: {c.text}" for c in r.criteria), len(tests),
            r.document.title if r.document else "", r.section, SOURCE_LABEL.get(r.analysis_source, r.analysis_source),
            r.review_status,
        ])
    summary = [
        ("Requirements", str(len(reqs))),
        ("High / critical risk", str(sum(1 for r in reqs if r.risk in {"High", "Critical"}))),
        ("Ambiguous (≥30%)", str(sum(1 for r in reqs if r.ambiguity_score >= 0.3))),
        ("Not testable", str(sum(1 for r in reqs if not r.testable))),
    ]
    return Dataset(
        "Requirements Report", _scope(db, project_id),
        ["Code", "External ID", "Title", "Description", "Category", "Priority", "Risk", "Complexity", "Testable",
         "Ambiguity", "Suggested clarification", "Acceptance criteria", "Tests", "Document", "Section",
         "Analysis source", "Review"],
        rows, summary,
        widths=[5, 0, 9, 18, 6, 5, 5, 0, 4, 4, 12, 18, 3, 0, 0, 6, 0],
    )


def test_cases_dataset(db: Session, project_id: int | None) -> Dataset:
    stmt = (select(TestCase).options(selectinload(TestCase.requirement), selectinload(TestCase.criterion))
            .order_by(TestCase.project_id, TestCase.id))
    if project_id:
        stmt = stmt.where(TestCase.project_id == project_id)
    tests = db.scalars(stmt).all()
    rows = [[
        t.code, t.requirement.code, t.criterion.code if t.criterion else "", t.title, t.scenario,
        t.test_type.replace("_", " "), t.priority, t.status.replace("_", " "),
        "\n".join(t.preconditions), "\n".join(f"{i}. {s}" for i, s in enumerate(t.steps, 1)),
        t.expected_result, t.test_data, SOURCE_LABEL.get(t.source, t.source),
    ] for t in tests]
    summary = [("Test cases", str(len(tests)))]
    for tt in ("positive", "negative", "edge_case", "functional", "regression"):
        n = sum(1 for t in tests if t.test_type == tt)
        if n:
            summary.append((tt.replace("_", " ").title(), str(n)))
    summary.append(("Needs review", str(sum(1 for t in tests if t.status == "needs_review"))))
    return Dataset(
        "Test Case Report", _scope(db, project_id),
        ["Test ID", "Requirement", "Criterion", "Title", "Scenario", "Type", "Priority", "Status",
         "Preconditions", "Steps", "Expected result", "Test data", "Source"],
        rows, summary, widths=[4, 4, 4, 10, 0, 4, 4, 4, 9, 16, 11, 9, 4],
    )


def changes_dataset(db: Session, project_id: int | None, change_set_id: int | None = None) -> Dataset:
    stmt = select(ChangeSet).join(Document).order_by(ChangeSet.created_at.desc())
    if project_id:
        stmt = stmt.where(Document.project_id == project_id)
    if change_set_id:
        stmt = stmt.where(ChangeSet.id == change_set_id)
    sets = db.scalars(stmt).all()
    rows = []
    totals = {"added": 0, "modified": 0, "removed": 0}
    for cs in sets:
        for rc in cs.changes:
            if rc.change_type == "unchanged":
                continue
            totals[rc.change_type] = totals.get(rc.change_type, 0) + 1
            rows.append([
                cs.document.title, f"v{cs.from_version} → v{cs.to_version}", rc.change_type.title(),
                rc.requirement_code, rc.severity.title(), f"{round(rc.similarity * 100)}%" if rc.change_type == "modified" else "",
                rc.old_text, rc.new_text, "; ".join(rc.signals), rc.impact, rc.affected_tests,
            ])
    summary = [("Change sets", str(len(sets)))] + [(k.title(), str(v)) for k, v in totals.items()]
    summary.append(("Tests affected", str(sum(cs.affected_tests for cs in sets))))
    subtitle = _scope(db, project_id)
    if len(sets) == 1:
        subtitle = f"{sets[0].document.title} · v{sets[0].from_version} → v{sets[0].to_version}"
    return Dataset(
        "Version Change Report", subtitle,
        ["Document", "Versions", "Change", "Requirement", "Severity", "Similarity", "Previous text", "New text",
         "Signals", "Impact", "Tests affected"],
        rows, summary, widths=[6, 4, 4, 4, 4, 4, 15, 15, 8, 10, 3],
    )


def traceability_dataset(db: Session, project_id: int | None) -> Dataset:
    m = build_matrix(db, project_id)
    rows = []
    for r in m["rows"]:
        crits = r["criteria"] or [{"code": "—", "text": "(no acceptance criteria)", "tests": []}]
        for i, c in enumerate(crits):
            tests = ", ".join(t["code"] for t in c["tests"]) or "NOT COVERED"
            rows.append([
                r["code"] if i == 0 else "", r["title"] if i == 0 else "", r["priority"] if i == 0 else "",
                r["status"].upper() if i == 0 else "", c["code"], c["text"], tests,
            ])
        if r["unlinked_tests"]:
            rows.append(["", "", "", "", "general", "Tests not linked to a criterion",
                         ", ".join(t["code"] for t in r["unlinked_tests"])])
    s = m["summary"]
    summary = [
        ("Requirements", str(s["requirements"])), ("Requirement coverage", f"{s['coverage_pct']}%"),
        ("Criteria coverage", f"{s['criteria_coverage_pct']}%"), ("Uncovered", str(s["uncovered"])),
        ("Partial", str(s["partial"])), ("Tests needing review", str(s["needs_review"])),
    ]
    return Dataset(
        "Traceability Matrix", _scope(db, project_id),
        ["Requirement", "Title", "Priority", "Coverage", "Criterion", "Acceptance criterion", "Test cases"],
        rows, summary, widths=[5, 12, 4, 5, 5, 26, 10],
    )


DATASETS = {
    "requirements": requirements_dataset,
    "test-cases": test_cases_dataset,
    "changes": changes_dataset,
    "traceability": traceability_dataset,
}
