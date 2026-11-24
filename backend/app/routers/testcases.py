from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from app import schemas
from app.database import get_db
from app.deps import get_intelligence
from app.models import AcceptanceCriterion, Requirement, TestCase
from app.routers.requirements import get_requirement_or_404
from app.serializers import test_case_out
from app.services.ai import IntelligenceService
from app.services.common import CodeAllocator, log_activity
from app.services.testgen import generate_for_requirements, regenerate

router = APIRouter(prefix="/test-cases", tags=["test cases"])


def get_test_or_404(db: Session, test_id: int) -> TestCase:
    tc = db.get(TestCase, test_id)
    if tc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Test case not found")
    return tc


def _check_criterion(db: Session, criterion_id: int | None, requirement_id: int) -> None:
    if criterion_id is None:
        return
    crit = db.get(AcceptanceCriterion, criterion_id)
    if crit is None or crit.requirement_id != requirement_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Acceptance criterion does not belong to this requirement")


@router.get("", response_model=list[schemas.TestCaseOut])
def list_test_cases(
    project_id: int | None = None,
    requirement_id: int | None = None,
    test_type: str | None = None,
    priority: str | None = None,
    status_filter: str | None = None,
    source: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
):
    stmt = (
        select(TestCase)
        .join(Requirement)
        .options(selectinload(TestCase.requirement), selectinload(TestCase.criterion))
        .order_by(TestCase.project_id, TestCase.id)
    )
    if project_id:
        stmt = stmt.where(TestCase.project_id == project_id)
    if requirement_id:
        stmt = stmt.where(TestCase.requirement_id == requirement_id)
    if test_type:
        stmt = stmt.where(TestCase.test_type == test_type)
    if priority:
        stmt = stmt.where(TestCase.priority == priority)
    if status_filter:
        stmt = stmt.where(TestCase.status == status_filter)
    if source:
        stmt = stmt.where(TestCase.source == source)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(TestCase.code.ilike(like), TestCase.title.ilike(like),
                              TestCase.scenario.ilike(like), Requirement.code.ilike(like)))
    return [test_case_out(t) for t in db.scalars(stmt).all()]


@router.post("/generate", response_model=schemas.GenerateResult)
def generate(
    body: schemas.GenerateRequest,
    db: Session = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence),
):
    ids = list(dict.fromkeys(body.requirement_ids))
    reqs = db.scalars(
        select(Requirement).where(Requirement.id.in_(ids)).options(
            selectinload(Requirement.criteria), selectinload(Requirement.test_cases))
    ).all()
    missing = set(ids) - {r.id for r in reqs}
    if missing:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Requirements not found: {sorted(missing)}")
    if any(r.status != "active" for r in reqs):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot generate tests for removed requirements")
    order = {rid: i for i, rid in enumerate(ids)}
    reqs = sorted(reqs, key=lambda r: order[r.id])
    created, sources = generate_for_requirements(db, reqs, list(dict.fromkeys(body.types)), body.per_type,
                                                 service, body.replace_existing)
    db.commit()
    source = "ai" if sources["ai"] and not sources["demo"] else "demo" if not sources["ai"] else "mixed"
    return schemas.GenerateResult(created=len(created), source=source,
                                  test_cases=[test_case_out(t) for t in created])


@router.post("", response_model=schemas.TestCaseOut, status_code=201)
def create_test_case(body: schemas.TestCaseCreate, db: Session = Depends(get_db)):
    req = get_requirement_or_404(db, body.requirement_id)
    _check_criterion(db, body.criterion_id, req.id)
    tc = TestCase(project_id=req.project_id, code=CodeAllocator(db, req.project_id).test_case(),
                  source="manual", **body.model_dump())
    db.add(tc)
    db.flush()
    log_activity(db, "test_created", f"{tc.code} added manually for {req.code}", req.project_id, "/test-cases")
    db.commit()
    db.refresh(tc)
    return test_case_out(tc)


@router.post("/bulk-delete", status_code=200)
def bulk_delete(body: schemas.BulkIds, db: Session = Depends(get_db)):
    tests = db.scalars(select(TestCase).where(TestCase.id.in_(body.ids))).all()
    for tc in tests:
        db.delete(tc)
    db.commit()
    return {"deleted": len(tests)}


@router.get("/{test_id}", response_model=schemas.TestCaseOut)
def get_test_case(test_id: int, db: Session = Depends(get_db)):
    return test_case_out(get_test_or_404(db, test_id))


@router.patch("/{test_id}", response_model=schemas.TestCaseOut)
def update_test_case(test_id: int, body: schemas.TestCaseUpdate, db: Session = Depends(get_db)):
    tc = get_test_or_404(db, test_id)
    data = body.model_dump(exclude_unset=True)
    if "criterion_id" in data:
        _check_criterion(db, data["criterion_id"], tc.requirement_id)
    for key, value in data.items():
        if value is not None or key == "criterion_id":
            setattr(tc, key, value)
    db.commit()
    db.refresh(tc)
    return test_case_out(tc)


@router.delete("/{test_id}", status_code=204)
def delete_test_case(test_id: int, db: Session = Depends(get_db)):
    tc = get_test_or_404(db, test_id)
    db.delete(tc)
    db.commit()


@router.post("/{test_id}/regenerate", response_model=schemas.TestCaseOut)
def regenerate_test_case(
    test_id: int,
    db: Session = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence),
):
    tc = get_test_or_404(db, test_id)
    regenerate(db, tc, service)
    db.commit()
    db.refresh(tc)
    return test_case_out(tc)
