"""Seeds a realistic demo workspace by running sample PDFs through the real pipeline."""

from __future__ import annotations

import logging
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select, update

from app.config import BACKEND_DIR, get_settings
from app.database import Base, SessionLocal, engine, init_db
from app.models import (
    Activity,
    ChangeSet,
    Document,
    DocumentVersion,
    Project,
    Requirement,
    TestCase,
)
from app.seed.sample_docs import ensure_samples
from app.services.ai import IntelligenceService
from app.services.ai.demo import DemoProvider
from app.services.common import log_activity
from app.services.pipeline import process_version
from app.services.testgen import generate_for_requirements

log = logging.getLogger("speclens.seed")
SAMPLES_DIR = BACKEND_DIR / "samples"


def _demo_service() -> IntelligenceService:
    return IntelligenceService(provider=DemoProvider())


def _backdate(since: datetime, when: datetime) -> None:
    with SessionLocal() as db:
        for model, col in ((Requirement, Requirement.created_at), (TestCase, TestCase.created_at),
                           (Activity, Activity.created_at), (ChangeSet, ChangeSet.created_at),
                           (Document, Document.created_at)):
            db.execute(update(model).where(col >= since).values({col.key: when}))
        db.execute(update(DocumentVersion).where(DocumentVersion.uploaded_at >= since)
                   .values(uploaded_at=when, processed_at=when + timedelta(seconds=40)))
        db.execute(update(Requirement).where(Requirement.updated_at >= since).values(updated_at=when))
        db.commit()


def _add_document(project_id: int, title: str, doc_type: str, pdf: Path) -> int:
    with SessionLocal() as db:
        doc = Document(project_id=project_id, title=title, doc_type=doc_type)
        db.add(doc)
        db.flush()
        vid = _add_version(db, doc, pdf, "v1.0")
        log_activity(db, "document_uploaded", f"Uploaded {title}", project_id, f"/documents/{doc.id}")
        db.commit()
        doc_id = doc.id
    process_version(vid, _demo_service())
    return doc_id


def _add_version(db, doc: Document, pdf: Path, label: str) -> int:
    number = len(doc.versions) + 1
    folder = Path(get_settings().upload_dir) / str(doc.id)
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"v{number}_{pdf.name}"
    shutil.copy(pdf, target)
    v = DocumentVersion(document_id=doc.id, version_number=number, label=label, filename=pdf.name,
                        file_path=str(target), file_size=target.stat().st_size, status="queued", stage="queued")
    doc.versions.append(v)
    db.flush()
    return v.id


def _generate(doc_id: int, ratio: float, ready_ratio: float = 0.4) -> None:
    with SessionLocal() as db:
        reqs = db.scalars(select(Requirement).where(Requirement.document_id == doc_id, Requirement.status == "active")
                          .order_by(Requirement.id)).all()
        chosen = [r for i, r in enumerate(reqs) if (i * 7) % 10 < ratio * 10]
        created, _ = generate_for_requirements(db, chosen, ["positive", "negative", "edge_case"], 1, _demo_service())
        for i, tc in enumerate(created):
            if (i * 3) % 10 < ready_ratio * 10:
                tc.status = "ready"
        db.commit()


def seed_demo() -> None:
    samples = ensure_samples(SAMPLES_DIR)
    now = datetime.now(timezone.utc)

    def step(days_ago: float):
        return now - timedelta(days=days_ago)

    with SessionLocal() as db:
        banking = Project(name="Aurora Online Banking", color="teal", status="active",
                          description="Retail banking web portal — account servicing, payments and self-service.")
        fleet = Project(name="FleetPulse Telematics", color="indigo", status="active",
                        description="Live vehicle tracking, driver safety scoring and maintenance planning.")
        medi = Project(name="MediTrack Patient Portal", color="rose", status="on_hold",
                       description="Patient appointments, lab results and secure messaging. Paused pending compliance review.")
        db.add_all([banking, fleet, medi])
        db.flush()
        for p in (banking, fleet, medi):
            log_activity(db, "project_created", f"Project “{p.name}” created", p.id, f"/projects/{p.id}")
        ids = banking.id, fleet.id, medi.id
        db.commit()
    _backdate(step(14), step(13))

    t = datetime.now(timezone.utc)
    bank_doc = _add_document(ids[0], "Aurora Retail Banking Portal — SRS", "SRS", samples["aurora_banking_srs_v1.0.pdf"])
    _backdate(t, step(12))
    t = datetime.now(timezone.utc)
    _generate(bank_doc, 0.8)
    _backdate(t, step(10))

    t = datetime.now(timezone.utc)
    fleet_doc = _add_document(ids[1], "FleetPulse Platform Requirements", "PRD",
                              samples["fleetpulse_platform_requirements.pdf"])
    _backdate(t, step(7))
    t = datetime.now(timezone.utc)
    _generate(fleet_doc, 0.5)
    _backdate(t, step(5))

    t = datetime.now(timezone.utc)
    medi_doc = _add_document(ids[2], "MediTrack Patient Portal — Functional Spec", "FSD",
                             samples["meditrack_patient_portal_spec.pdf"])
    _backdate(t, step(4))
    t = datetime.now(timezone.utc)
    _generate(medi_doc, 0.3)
    _backdate(t, step(3.5))

    # Revision of the banking SRS → change set with impacted tests.
    t = datetime.now(timezone.utc)
    with SessionLocal() as db:
        doc = db.get(Document, bank_doc)
        vid = _add_version(db, doc, samples["aurora_banking_srs_v1.1.pdf"], "v1.1 · CR-114")
        log_activity(db, "version_uploaded", f"Uploaded {doc.title} v2", doc.project_id, f"/documents/{doc.id}")
        db.commit()
    process_version(vid, _demo_service())
    _backdate(t, step(1))
    log.info("Demo workspace seeded")


def is_empty() -> bool:
    with SessionLocal() as db:
        return (db.scalar(select(func.count(Project.id))) or 0) == 0


def reset_and_seed() -> None:
    Base.metadata.drop_all(bind=engine)
    shutil.rmtree(get_settings().upload_dir, ignore_errors=True)
    init_db()
    seed_demo()
