"""Traceability matrix: Requirement → Acceptance Criteria → Test Cases."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import AcceptanceCriterion, Requirement


def _test_brief(tc) -> dict:
    return {"id": tc.id, "code": tc.code, "title": tc.title, "test_type": tc.test_type,
            "status": tc.status, "priority": tc.priority, "source": tc.source}


def build_matrix(db: Session, project_id: int | None = None, document_id: int | None = None) -> dict:
    stmt = (
        select(Requirement)
        .where(Requirement.status == "active")
        .options(
            selectinload(Requirement.criteria).selectinload(AcceptanceCriterion.test_cases),
            selectinload(Requirement.test_cases),
            selectinload(Requirement.document),
        )
        .order_by(Requirement.project_id, Requirement.id)
    )
    if project_id:
        stmt = stmt.where(Requirement.project_id == project_id)
    if document_id:
        stmt = stmt.where(Requirement.document_id == document_id)
    reqs = db.scalars(stmt).all()

    rows, gaps = [], []
    by_category: dict[str, dict[str, int]] = {}
    totals = {"requirements": 0, "covered": 0, "partial": 0, "uncovered": 0,
              "criteria": 0, "criteria_covered": 0, "tests": 0, "needs_review": 0}

    for req in reqs:
        active = [t for t in req.test_cases if t.status != "obsolete"]
        criteria = []
        covered_criteria = 0
        for c in req.criteria:
            ctests = [t for t in active if t.criterion_id == c.id]
            covered_criteria += 1 if ctests else 0
            criteria.append({"id": c.id, "code": c.code, "text": c.text, "tests": [_test_brief(t) for t in ctests]})
        crit_ids = {c.id for c in req.criteria}
        unlinked = [t for t in active if t.criterion_id not in crit_ids]

        if not active:
            status = "uncovered"
        elif req.criteria and covered_criteria < len(req.criteria):
            status = "partial"
        else:
            status = "covered"

        totals["requirements"] += 1
        totals[status] += 1
        totals["criteria"] += len(req.criteria)
        totals["criteria_covered"] += covered_criteria
        totals["tests"] += len(active)
        review = sum(1 for t in active if t.status == "needs_review")
        totals["needs_review"] += review
        cat = by_category.setdefault(req.category, {"total": 0, "covered": 0, "partial": 0, "uncovered": 0})
        cat["total"] += 1
        cat[status] += 1

        rows.append({
            "id": req.id, "code": req.code, "title": req.title, "category": req.category,
            "priority": req.priority, "risk": req.risk, "testable": req.testable,
            "document": req.document.title if req.document else None, "document_id": req.document_id,
            "project_id": req.project_id, "status": status,
            "criteria": criteria, "unlinked_tests": [_test_brief(t) for t in unlinked],
            "test_count": len(active), "needs_review": review,
            "criteria_covered": covered_criteria, "criteria_total": len(req.criteria),
        })

        if status == "uncovered":
            sev = "high" if req.priority in {"High", "Critical"} or req.risk in {"High", "Critical"} else "medium"
            gaps.append({"type": "uncovered", "severity": sev, "requirement_id": req.id, "code": req.code,
                         "message": f"{req.code} has no test cases ({req.priority} priority, {req.risk} risk)."})
        elif status == "partial":
            missing = [c["code"] for c in criteria if not c["tests"]]
            gaps.append({"type": "criteria_gap", "severity": "medium", "requirement_id": req.id, "code": req.code,
                         "message": f"{req.code}: acceptance criteria {', '.join(missing)} are not verified by any test."})
        if review:
            gaps.append({"type": "needs_review", "severity": "high", "requirement_id": req.id, "code": req.code,
                         "message": f"{req.code} changed in a newer version — {review} test case(s) need review."})
        if not req.testable:
            gaps.append({"type": "untestable", "severity": "medium", "requirement_id": req.id, "code": req.code,
                         "message": f"{req.code} is not objectively testable as written — clarify before testing."})

    n = totals["requirements"]
    summary = {
        **totals,
        "coverage_pct": round(100 * (totals["covered"] + totals["partial"]) / n, 1) if n else 0.0,
        "full_coverage_pct": round(100 * totals["covered"] / n, 1) if n else 0.0,
        "criteria_coverage_pct": round(100 * totals["criteria_covered"] / totals["criteria"], 1) if totals["criteria"] else 0.0,
    }
    sev_rank = {"high": 0, "medium": 1, "low": 2}
    gaps.sort(key=lambda g: sev_rank.get(g["severity"], 3))
    return {
        "summary": summary,
        "by_category": [{"category": k, **v} for k, v in sorted(by_category.items(), key=lambda kv: -kv[1]["total"])],
        "rows": rows,
        "gaps": gaps,
    }
