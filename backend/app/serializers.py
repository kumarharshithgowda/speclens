"""ORM → schema conversion helpers that add computed fields."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import schemas
from app.models import ChangeSet, Document, Project, Requirement, TestCase
from app.services.comparator import word_diff


def project_out(db: Session, p: Project) -> schemas.ProjectOut:
    docs = db.scalar(select(func.count(Document.id)).where(Document.project_id == p.id)) or 0
    req_ids = db.scalars(
        select(Requirement.id).where(Requirement.project_id == p.id, Requirement.status == "active")
    ).all()
    tests = db.scalar(
        select(func.count(TestCase.id)).where(TestCase.project_id == p.id, TestCase.status != "obsolete")
    ) or 0
    covered = db.scalar(
        select(func.count(func.distinct(TestCase.requirement_id))).where(
            TestCase.project_id == p.id, TestCase.status != "obsolete", TestCase.requirement_id.in_(req_ids)
        )
    ) or 0 if req_ids else 0
    review = db.scalar(
        select(func.count(TestCase.id)).where(TestCase.project_id == p.id, TestCase.status == "needs_review")
    ) or 0
    alerts = db.scalar(
        select(func.count(ChangeSet.id)).join(Document).where(
            Document.project_id == p.id, ChangeSet.acknowledged.is_(False)
        )
    ) or 0
    out = schemas.ProjectOut.model_validate(p)
    out.stats = schemas.ProjectStats(
        documents=docs, requirements=len(req_ids), test_cases=tests,
        coverage_pct=round(100 * covered / len(req_ids), 1) if req_ids else 0.0,
        open_alerts=alerts, needs_review=review,
    )
    return out


def document_out(doc: Document, detail: bool = False) -> schemas.DocumentOut:
    cls = schemas.DocumentDetail if detail else schemas.DocumentOut
    out = cls.model_validate(doc, from_attributes=True)
    out.project_name = doc.project.name if doc.project else ""
    out.version_count = len(doc.versions)
    out.latest_version = (
        schemas.VersionOut.model_validate(doc.versions[-1]) if doc.versions else None
    )
    out.requirement_count = sum(1 for r in doc.requirements if r.status == "active")
    if detail:
        out.versions = [schemas.VersionOut.model_validate(v) for v in reversed(doc.versions)]  # type: ignore[attr-defined]
    return out


def requirement_out(r: Requirement) -> schemas.RequirementOut:
    out = schemas.RequirementOut.model_validate(r)
    out.document_title = r.document.title if r.document else None
    active = [t for t in r.test_cases if t.status != "obsolete"]
    out.test_count = len(active)
    out.needs_review = sum(1 for t in active if t.status == "needs_review")
    return out


def test_case_out(t: TestCase) -> schemas.TestCaseOut:
    out = schemas.TestCaseOut.model_validate(t)
    out.requirement_code = t.requirement.code if t.requirement else ""
    out.requirement_title = t.requirement.title if t.requirement else ""
    out.criterion_code = t.criterion.code if t.criterion else None
    return out


def change_set_out(cs: ChangeSet, detail: bool = False) -> schemas.ChangeSetOut:
    cls = schemas.ChangeSetDetail if detail else schemas.ChangeSetOut
    out = cls.model_validate(cs, from_attributes=True)
    out.document_title = cs.document.title
    out.project_id = cs.document.project_id
    out.project_name = cs.document.project.name
    if detail:
        changes = []
        for rc in cs.changes:
            item = schemas.RequirementChangeOut.model_validate(rc)
            if rc.change_type == "modified":
                item.diff = word_diff(rc.old_text, rc.new_text)
            changes.append(item)
        out.changes = changes  # type: ignore[attr-defined]
    return out
