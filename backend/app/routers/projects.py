from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.config import get_settings
from app.database import get_db
from app.models import Project
from app.serializers import project_out
from app.services.common import log_activity

router = APIRouter(prefix="/projects", tags=["projects"])


def get_project_or_404(db: Session, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    return project


@router.get("", response_model=list[schemas.ProjectOut])
def list_projects(
    q: str | None = None,
    status_filter: schemas.ProjectStatus | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    stmt = select(Project).order_by(Project.updated_at.desc())
    if q:
        stmt = stmt.where(Project.name.ilike(f"%{q.strip()}%"))
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    return [project_out(db, p) for p in db.scalars(stmt).all()]


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(body: schemas.ProjectCreate, db: Session = Depends(get_db)):
    project = Project(**body.model_dump())
    db.add(project)
    db.flush()
    log_activity(db, "project_created", f"Project “{project.name}” created", project.id, f"/projects/{project.id}")
    db.commit()
    return project_out(db, project)


@router.get("/{project_id}", response_model=schemas.ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db)):
    return project_out(db, get_project_or_404(db, project_id))


@router.patch("/{project_id}", response_model=schemas.ProjectOut)
def update_project(project_id: int, body: schemas.ProjectUpdate, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(project, key, value)
    log_activity(db, "project_updated", f"Project “{project.name}” updated", project.id, f"/projects/{project.id}")
    db.commit()
    return project_out(db, project)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = get_project_or_404(db, project_id)
    upload_root = Path(get_settings().upload_dir)
    doc_dirs = [upload_root / str(d.id) for d in project.documents]
    name = project.name
    db.delete(project)
    log_activity(db, "project_deleted", f"Project “{name}” deleted")
    db.commit()
    for d in doc_dirs:
        shutil.rmtree(d, ignore_errors=True)
