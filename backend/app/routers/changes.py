from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import schemas
from app.database import get_db
from app.models import ChangeSet, Document, DocumentVersion
from app.routers.documents import get_document_or_404
from app.serializers import change_set_out
from app.services.comparator import Item, compare, word_diff

router = APIRouter(tags=["change analysis"])


@router.get("/changes", response_model=list[schemas.ChangeSetOut])
def list_change_sets(project_id: int | None = None, document_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(ChangeSet).join(Document).order_by(ChangeSet.created_at.desc(), ChangeSet.id.desc())
    if project_id:
        stmt = stmt.where(Document.project_id == project_id)
    if document_id:
        stmt = stmt.where(ChangeSet.document_id == document_id)
    return [change_set_out(cs) for cs in db.scalars(stmt).all()]


@router.get("/changes/{change_set_id}", response_model=schemas.ChangeSetDetail)
def get_change_set(change_set_id: int, db: Session = Depends(get_db)):
    cs = db.get(ChangeSet, change_set_id)
    if cs is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Change set not found")
    return change_set_out(cs, detail=True)


@router.post("/changes/{change_set_id}/acknowledge", response_model=schemas.ChangeSetOut)
def acknowledge(change_set_id: int, db: Session = Depends(get_db)):
    cs = db.get(ChangeSet, change_set_id)
    if cs is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Change set not found")
    cs.acknowledged = True
    db.commit()
    return change_set_out(cs)


@router.get("/documents/{document_id}/compare")
def compare_versions(
    document_id: int,
    from_version: int = Query(..., alias="from", ge=1),
    to_version: int = Query(..., alias="to", ge=1),
    db: Session = Depends(get_db),
):
    """Ad-hoc comparison of any two processed versions using their extraction snapshots."""
    doc = get_document_or_404(db, document_id)
    if from_version == to_version:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Choose two different versions")
    versions = {v.version_number: v for v in doc.versions}
    old_v: DocumentVersion | None = versions.get(from_version)
    new_v: DocumentVersion | None = versions.get(to_version)
    if old_v is None or new_v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Version not found")
    if old_v.status != "ready" or new_v.status != "ready":
        raise HTTPException(status.HTTP_409_CONFLICT, "Both versions must be processed")

    def items(v: DocumentVersion) -> list[Item]:
        return [Item(str(i), s["text"], s.get("external_id"), s.get("section", "")) for i, s in enumerate(v.snapshot or [])]

    changes = compare(items(old_v), items(new_v))
    counts = {k: 0 for k in ("added", "modified", "removed", "unchanged")}
    sev = {k: 0 for k in ("critical", "high", "medium", "low")}
    out = []
    for pos, c in enumerate(changes):
        counts[c.change_type] += 1
        if c.severity in sev:
            sev[c.severity] += 1
        old_t, new_t = (c.old.text if c.old else ""), (c.new.text if c.new else "")
        out.append({
            "position": pos, "change_type": c.change_type, "old_text": old_t, "new_text": new_t,
            "section": (c.new or c.old).section if (c.new or c.old) else "",
            "similarity": c.similarity, "severity": c.severity, "signals": c.signals,
            "diff": word_diff(old_t, new_t) if c.change_type == "modified" else [],
        })
    return {"document_id": doc.id, "document_title": doc.title, "from_version": from_version,
            "to_version": to_version, "counts": counts, "severity_counts": sev, "changes": out}
