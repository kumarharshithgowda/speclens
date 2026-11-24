from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app import schemas
from app.database import get_db
from app.deps import get_intelligence
from app.models import Document, Requirement
from app.routers.projects import get_project_or_404
from app.serializers import requirement_out
from app.services.ai import IntelligenceService
from app.services.ai.demo import make_title
from app.services.common import CodeAllocator, log_activity
from app.services.requirements import analyze_requirements, set_criteria

router = APIRouter(prefix="/requirements", tags=["requirements"])


def get_requirement_or_404(db: Session, requirement_id: int) -> Requirement:
    req = db.get(Requirement, requirement_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Requirement not found")
    return req


@router.get("", response_model=list[schemas.RequirementOut])
def list_requirements(
    project_id: int | None = None,
    document_id: int | None = None,
    category: str | None = None,
    priority: str | None = None,
    risk: str | None = None,
    testable: bool | None = None,
    ambiguous: bool | None = None,
    coverage: str | None = None,
    review_status: str | None = None,
    status_filter: str = "active",
    q: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = (
        select(Requirement)
        .options(selectinload(Requirement.criteria), selectinload(Requirement.test_cases),
                 selectinload(Requirement.document))
        .order_by(Requirement.project_id, Requirement.id)
    )
    if status_filter != "all":
        stmt = stmt.where(Requirement.status == status_filter)
    if project_id:
        stmt = stmt.where(Requirement.project_id == project_id)
    if document_id:
        stmt = stmt.where(Requirement.document_id == document_id)
    if category:
        stmt = stmt.where(Requirement.category == category)
    if priority:
        stmt = stmt.where(Requirement.priority == priority)
    if risk:
        stmt = stmt.where(Requirement.risk == risk)
    if testable is not None:
        stmt = stmt.where(Requirement.testable.is_(testable))
    if ambiguous is not None:
        stmt = stmt.where(Requirement.ambiguity_score >= 0.3 if ambiguous else Requirement.ambiguity_score < 0.3)
    if review_status:
        stmt = stmt.where(Requirement.review_status == review_status)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(Requirement.code.ilike(like), Requirement.title.ilike(like),
                              Requirement.description.ilike(like), Requirement.external_id.ilike(like)))
    items = [requirement_out(r) for r in db.scalars(stmt).all()]
    if coverage == "covered":
        items = [r for r in items if r.test_count > 0]
    elif coverage == "uncovered":
        items = [r for r in items if r.test_count == 0]
    return items


@router.post("", response_model=schemas.RequirementOut, status_code=201)
def create_requirement(
    body: schemas.RequirementCreate,
    db: Session = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence),
):
    project = get_project_or_404(db, body.project_id)
    if body.document_id:
        doc = db.get(Document, body.document_id)
        if doc is None or doc.project_id != project.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Document does not belong to this project")
    req = Requirement(
        project_id=project.id, document_id=body.document_id, code=CodeAllocator(db, project.id).requirement(),
        title=body.title or make_title(body.description), description=body.description,
        source_text="", section=body.section, analysis_source="manual", edited=bool(body.title),
    )
    db.add(req)
    db.flush()
    if body.analyze:
        analyze_requirements(db, [req], service)
    log_activity(db, "requirement_created", f"{req.code} added manually to {project.name}", project.id,
                 f"/requirements?focus={req.id}")
    db.commit()
    return requirement_out(req)


@router.get("/{requirement_id}", response_model=schemas.RequirementOut)
def get_requirement(requirement_id: int, db: Session = Depends(get_db)):
    return requirement_out(get_requirement_or_404(db, requirement_id))


@router.patch("/{requirement_id}", response_model=schemas.RequirementOut)
def update_requirement(requirement_id: int, body: schemas.RequirementUpdate, db: Session = Depends(get_db)):
    req = get_requirement_or_404(db, requirement_id)
    data = body.model_dump(exclude_unset=True)
    content_fields = {"title", "description", "category", "priority", "risk", "complexity", "testable"}
    for key, value in data.items():
        if value is not None:
            setattr(req, key, value)
    if content_fields & data.keys():
        req.edited = True
    db.commit()
    return requirement_out(req)


@router.delete("/{requirement_id}", status_code=204)
def delete_requirement(requirement_id: int, db: Session = Depends(get_db)):
    req = get_requirement_or_404(db, requirement_id)
    log_activity(db, "requirement_deleted", f"{req.code} deleted", req.project_id)
    db.delete(req)
    db.commit()


@router.post("/{requirement_id}/reanalyze", response_model=schemas.RequirementOut)
def reanalyze_requirement(
    requirement_id: int,
    db: Session = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence),
):
    req = get_requirement_or_404(db, requirement_id)
    req.edited = False
    analyze_requirements(db, [req], service)
    db.commit()
    return requirement_out(req)


@router.put("/{requirement_id}/criteria", response_model=schemas.RequirementOut)
def replace_criteria(requirement_id: int, body: schemas.CriteriaUpdate, db: Session = Depends(get_db)):
    req = get_requirement_or_404(db, requirement_id)
    set_criteria(req, body.criteria)
    db.commit()
    db.refresh(req)
    return requirement_out(req)
