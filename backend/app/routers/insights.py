"""Dashboard, traceability and global search."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Activity, ChangeSet, Document, DocumentVersion, Project, Requirement, TestCase
from app.serializers import change_set_out, project_out
from app.services.traceability import build_matrix

router = APIRouter(tags=["insights"])


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


@router.get("/dashboard")
def dashboard(project_id: int | None = None, db: Session = Depends(get_db)):
    def scoped(stmt, col):
        return stmt.where(col == project_id) if project_id else stmt

    projects = db.scalar(select(func.count(Project.id))) or 0
    documents = db.scalar(scoped(select(func.count(Document.id)), Document.project_id)) or 0
    versions = db.scalar(
        scoped(select(func.count(DocumentVersion.id)).join(Document), Document.project_id)
    ) or 0
    reqs = db.scalars(scoped(select(Requirement).where(Requirement.status == "active"), Requirement.project_id)).all()
    tests = db.scalars(scoped(select(TestCase).where(TestCase.status != "obsolete"), TestCase.project_id)).all()

    matrix = build_matrix(db, project_id)
    s = matrix["summary"]

    # 14-day trend of requirements and tests created.
    today = datetime.now(timezone.utc).date()
    days = [today - timedelta(days=i) for i in range(13, -1, -1)]
    req_days = Counter(_as_utc(r.created_at).date() for r in reqs)
    test_days = Counter(_as_utc(t.created_at).date() for t in tests)
    trend, rc, tc = [], 0, 0
    base_r = sum(v for d, v in req_days.items() if d < days[0])
    base_t = sum(v for d, v in test_days.items() if d < days[0])
    rc, tc = base_r, base_t
    for d in days:
        rc += req_days.get(d, 0)
        tc += test_days.get(d, 0)
        trend.append({"date": d.isoformat(), "requirements": rc, "test_cases": tc})

    activity = db.scalars(
        scoped(select(Activity), Activity.project_id).order_by(Activity.created_at.desc(), Activity.id.desc()).limit(12)
    ).all()
    recent_projects = db.scalars(select(Project).order_by(Project.updated_at.desc()).limit(4)).all()
    alerts = db.scalars(
        scoped(select(ChangeSet).join(Document), Document.project_id)
        .where(ChangeSet.acknowledged.is_(False))
        .order_by(ChangeSet.created_at.desc())
        .limit(5)
    ).all()
    processing = db.scalar(
        scoped(select(func.count(DocumentVersion.id)).join(Document), Document.project_id)
        .where(DocumentVersion.status.in_(["queued", "processing"]))
    ) or 0

    order = ["Critical", "High", "Medium", "Low"]
    return {
        "kpis": {
            "projects": projects, "documents": documents, "versions": versions,
            "requirements": len(reqs), "test_cases": len(tests),
            "coverage_pct": s["coverage_pct"], "criteria_coverage_pct": s["criteria_coverage_pct"],
            "uncovered": s["uncovered"], "needs_review": s["needs_review"],
            "ambiguous": sum(1 for r in reqs if r.ambiguity_score >= 0.3),
            "high_risk": sum(1 for r in reqs if r.risk in {"High", "Critical"}),
            "processing": processing,
        },
        "by_category": [{"name": k, "value": v} for k, v in Counter(r.category for r in reqs).most_common()],
        "by_priority": [{"name": p, "value": sum(1 for r in reqs if r.priority == p)} for p in order],
        "by_risk": [{"name": p, "value": sum(1 for r in reqs if r.risk == p)} for p in order],
        "test_types": [{"name": k, "value": v} for k, v in Counter(t.test_type for t in tests).most_common()],
        "coverage": {"covered": s["covered"], "partial": s["partial"], "uncovered": s["uncovered"]},
        "trend": trend,
        "activity": [
            {"id": a.id, "kind": a.kind, "message": a.message, "link": a.link,
             "created_at": a.created_at, "project_id": a.project_id}
            for a in activity
        ],
        "recent_projects": [project_out(db, p) for p in recent_projects],
        "alerts": [change_set_out(cs) for cs in alerts],
    }


@router.get("/traceability")
def traceability(project_id: int | None = None, document_id: int | None = None, db: Session = Depends(get_db)):
    return build_matrix(db, project_id, document_id)


@router.get("/search")
def search(q: str = Query(..., min_length=2, max_length=100), db: Session = Depends(get_db)):
    like = f"%{q.strip()}%"
    projects = db.scalars(select(Project).where(Project.name.ilike(like)).limit(5)).all()
    docs = db.scalars(select(Document).where(Document.title.ilike(like)).limit(5)).all()
    reqs = db.scalars(
        select(Requirement).where(
            Requirement.status == "active",
            or_(Requirement.code.ilike(like), Requirement.title.ilike(like), Requirement.description.ilike(like)),
        ).limit(8)
    ).all()
    tests = db.scalars(
        select(TestCase).where(or_(TestCase.code.ilike(like), TestCase.title.ilike(like))).limit(8)
    ).all()
    return {
        "projects": [{"id": p.id, "title": p.name, "subtitle": p.status.replace("_", " ")} for p in projects],
        "documents": [{"id": d.id, "title": d.title, "subtitle": f"v{d.current_version} · {d.doc_type}"} for d in docs],
        "requirements": [{"id": r.id, "title": f"{r.code} · {r.title}", "subtitle": r.category} for r in reqs],
        "test_cases": [{"id": t.id, "title": f"{t.code} · {t.title}", "subtitle": t.test_type} for t in tests],
    }
