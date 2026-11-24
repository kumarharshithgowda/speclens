from __future__ import annotations

import re
import shutil
from pathlib import Path

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import schemas
from app.config import get_settings
from app.database import get_db
from app.deps import get_intelligence
from app.models import Document, DocumentVersion, Section
from app.routers.projects import get_project_or_404
from app.serializers import document_out
from app.services.ai import IntelligenceService
from app.services.common import log_activity
from app.services.pipeline import process_version

router = APIRouter(tags=["documents"])


def get_document_or_404(db: Session, document_id: int) -> Document:
    doc = db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc


def get_version_or_404(db: Session, version_id: int) -> DocumentVersion:
    v = db.get(DocumentVersion, version_id)
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    return v


async def _read_pdf(file: UploadFile) -> bytes:
    settings = get_settings()
    name = file.filename or ""
    if not name.lower().endswith(".pdf"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Only PDF files are supported.")
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty.")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"File exceeds the {settings.max_upload_mb} MB limit.")
    if not data.lstrip()[:5].startswith(b"%PDF"):
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "The file content is not a valid PDF.")
    return data


def _store(doc: Document, version_number: int, filename: str, data: bytes) -> Path:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "_", Path(filename).name)[:120] or "document.pdf"
    folder = Path(get_settings().upload_dir) / str(doc.id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"v{version_number}_{safe}"
    path.write_bytes(data)
    return path


def _create_version(db: Session, doc: Document, filename: str, data: bytes, label: str = "") -> DocumentVersion:
    number = (doc.versions[-1].version_number if doc.versions else 0) + 1
    path = _store(doc, number, filename, data)
    version = DocumentVersion(
        document_id=doc.id, version_number=number, label=label[:60] or f"v{number}", filename=filename[:255],
        file_path=str(path), file_size=len(data), status="queued", stage="queued", progress=0,
    )
    doc.versions.append(version)
    db.flush()
    return version


@router.get("/documents", response_model=list[schemas.DocumentOut])
def list_documents(project_id: int | None = None, q: str | None = None, db: Session = Depends(get_db)):
    stmt = (
        select(Document)
        .options(selectinload(Document.versions), selectinload(Document.requirements), selectinload(Document.project))
        .order_by(Document.updated_at.desc())
    )
    if project_id:
        stmt = stmt.where(Document.project_id == project_id)
    if q:
        stmt = stmt.where(Document.title.ilike(f"%{q.strip()}%"))
    return [document_out(d) for d in db.scalars(stmt).all()]


@router.post("/documents", response_model=schemas.DocumentDetail, status_code=201)
async def upload_document(
    background: BackgroundTasks,
    project_id: int = Form(...),
    file: UploadFile = File(...),
    title: str = Form(""),
    doc_type: str = Form("SRS"),
    db: Session = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence),
):
    project = get_project_or_404(db, project_id)
    data = await _read_pdf(file)
    clean_title = (title or "").strip() or Path(file.filename or "Document").stem.replace("_", " ").strip()
    doc = Document(project_id=project.id, title=clean_title[:200], doc_type=(doc_type or "SRS")[:40])
    db.add(doc)
    db.flush()
    version = _create_version(db, doc, file.filename or "document.pdf", data)
    log_activity(db, "document_uploaded", f"Uploaded {doc.title} to {project.name}", project.id, f"/documents/{doc.id}")
    db.commit()
    background.add_task(process_version, version.id, service)
    return document_out(doc, detail=True)


@router.get("/documents/{document_id}", response_model=schemas.DocumentDetail)
def get_document(document_id: int, db: Session = Depends(get_db)):
    return document_out(get_document_or_404(db, document_id), detail=True)


@router.patch("/documents/{document_id}", response_model=schemas.DocumentDetail)
def update_document(document_id: int, body: schemas.DocumentUpdate, db: Session = Depends(get_db)):
    doc = get_document_or_404(db, document_id)
    data = body.model_dump(exclude_unset=True)
    if data.get("project_id") and data["project_id"] != doc.project_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Moving documents between projects is not supported.")
    if data.get("title"):
        doc.title = data["title"].strip()
    if data.get("doc_type"):
        doc.doc_type = data["doc_type"].strip()
    db.commit()
    return document_out(doc, detail=True)


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: int, db: Session = Depends(get_db)):
    doc = get_document_or_404(db, document_id)
    for req in list(doc.requirements):
        db.delete(req)
    folder = Path(get_settings().upload_dir) / str(doc.id)
    log_activity(db, "document_deleted", f"Deleted document {doc.title}", doc.project_id)
    db.delete(doc)
    db.commit()
    shutil.rmtree(folder, ignore_errors=True)


@router.post("/documents/{document_id}/versions", response_model=schemas.VersionOut, status_code=201)
async def upload_version(
    document_id: int,
    background: BackgroundTasks,
    file: UploadFile = File(...),
    label: str = Form(""),
    db: Session = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence),
):
    doc = get_document_or_404(db, document_id)
    if any(v.status in {"queued", "processing"} for v in doc.versions):
        raise HTTPException(status.HTTP_409_CONFLICT, "A version of this document is still being processed.")
    if not any(v.status == "ready" for v in doc.versions):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "The previous version has not been processed successfully. Re-process it first.")
    data = await _read_pdf(file)
    version = _create_version(db, doc, file.filename or "document.pdf", data, label)
    log_activity(db, "version_uploaded", f"Uploaded {doc.title} v{version.version_number}", doc.project_id,
                 f"/documents/{doc.id}")
    db.commit()
    background.add_task(process_version, version.id, service)
    return schemas.VersionOut.model_validate(version)


@router.get("/documents/{document_id}/versions", response_model=list[schemas.VersionOut])
def list_versions(document_id: int, db: Session = Depends(get_db)):
    doc = get_document_or_404(db, document_id)
    return [schemas.VersionOut.model_validate(v) for v in reversed(doc.versions)]


@router.get("/versions/{version_id}", response_model=schemas.VersionOut)
def get_version(version_id: int, db: Session = Depends(get_db)):
    return schemas.VersionOut.model_validate(get_version_or_404(db, version_id))


@router.post("/versions/{version_id}/reprocess", response_model=schemas.VersionOut)
def reprocess_version(
    version_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    service: IntelligenceService = Depends(get_intelligence),
):
    v = get_version_or_404(db, version_id)
    if v.status != "failed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Only failed versions can be re-processed.")
    v.status, v.stage, v.progress, v.error = "queued", "queued", 0, None
    db.commit()
    background.add_task(process_version, v.id, service)
    return schemas.VersionOut.model_validate(v)


@router.get("/versions/{version_id}/sections", response_model=list[schemas.SectionOut])
def get_sections(version_id: int, q: str | None = None, db: Session = Depends(get_db)):
    get_version_or_404(db, version_id)
    stmt = select(Section).where(Section.version_id == version_id).order_by(Section.position)
    if q:
        stmt = stmt.where(Section.text.ilike(f"%{q.strip()}%"))
    return db.scalars(stmt).all()


@router.get("/versions/{version_id}/file")
def get_version_file(version_id: int, db: Session = Depends(get_db)):
    v = get_version_or_404(db, version_id)
    path = Path(v.file_path)
    if not path.exists():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Original file is no longer available.")
    return FileResponse(path, media_type="application/pdf", filename=v.filename,
                        content_disposition_type="inline")
