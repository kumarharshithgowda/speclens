"""Document processing pipeline.

upload → extract structure → mine requirements → (first version) analyse
                                              → (revision) compare with live requirements,
                                                apply changes, flag affected tests, analyse
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import ChangeSet, DocumentVersion, Requirement, RequirementChange, Section
from app.services.ai import ChangeBrief, IntelligenceService
from app.services.ai.demo import make_title
from app.services.common import CodeAllocator, log_activity
from app.services.comparator import Item, compare, severity_for
from app.services.miner import Candidate, mine_requirements
from app.services.pdf_extractor import PDFExtractionError, extract_pdf
from app.services.requirements import analyze_requirements

log = logging.getLogger("speclens.pipeline")


def process_version(version_id: int, service: IntelligenceService | None = None) -> None:
    """Entry point for background processing. Never raises; failures are recorded."""
    db = SessionLocal()
    try:
        _run(db, version_id, service or IntelligenceService())
    except Exception as exc:  # noqa: BLE001 - we record any failure on the version
        log.exception("Processing failed for version %s", version_id)
        db.rollback()
        version = db.get(DocumentVersion, version_id)
        if version is not None:
            version.status = "failed"
            version.stage = "failed"
            version.error = str(exc) if isinstance(exc, PDFExtractionError) else f"Processing error: {exc}"
            log_activity(
                db, "document_failed",
                f"Processing failed for {version.document.title} v{version.version_number}: {version.error}",
                version.document.project_id, f"/documents/{version.document_id}",
            )
            db.commit()
    finally:
        db.close()


def _stage(db: Session, version: DocumentVersion, stage: str, progress: int) -> None:
    version.status = "processing"
    version.stage = stage
    version.progress = progress
    db.commit()


def _new_requirement(alloc: CodeAllocator, project_id: int, document_id: int, c: Candidate, vno: int) -> Requirement:
    return Requirement(
        project_id=project_id,
        document_id=document_id,
        code=alloc.requirement(),
        external_id=c.external_id,
        title=make_title(c.text),
        description=c.text,
        source_text=c.text,
        section=c.section[:300],
        page=c.page,
        introduced_version=vno,
        last_changed_version=vno,
    )


def _run(db: Session, version_id: int, service: IntelligenceService) -> None:
    version = db.get(DocumentVersion, version_id)
    if version is None:
        return
    doc = version.document
    project_id = doc.project_id
    vno = version.version_number

    _stage(db, version, "extracting", 10)
    result = extract_pdf(Path(version.file_path).read_bytes())
    version.page_count = result.page_count

    _stage(db, version, "mining", 30)
    candidates = mine_requirements(result.blocks)
    req_blocks = {c.block_position for c in candidates}
    db.execute(delete(Section).where(Section.version_id == version.id))
    for b in result.blocks:
        db.add(Section(
            version_id=version.id, position=b.position, kind=b.kind, level=b.level,
            heading_path=b.heading_path[:500], text=b.text, page=b.page, table=b.table,
            is_requirement=b.position in req_blocks,
        ))
    version.snapshot = [
        {"text": c.text, "external_id": c.external_id, "section": c.section, "page": c.page,
         "priority_hint": c.priority_hint}
        for c in candidates
    ]
    version.stats = {**result.stats, "requirements": len(candidates)}
    _stage(db, version, "analyzing", 40)

    def progress(done: int, total: int) -> None:
        version.progress = 40 + int(50 * done / max(total, 1))
        db.commit()

    alloc = CodeAllocator(db, project_id)
    live = db.scalars(
        select(Requirement)
        .where(Requirement.document_id == doc.id, Requirement.status == "active")
        .order_by(Requirement.id)
    ).all()

    counts = {"ai": 0, "demo": 0}
    if not live:
        reqs = [_new_requirement(alloc, project_id, doc.id, c, vno) for c in candidates]
        db.add_all(reqs)
        db.flush()
        hints = {id(r): c.priority_hint for r, c in zip(reqs, candidates)}
        counts = analyze_requirements(db, reqs, service, hints, progress)
        log_activity(db, "requirements_extracted",
                     f"Extracted {len(reqs)} requirements from {doc.title} v{vno}",
                     project_id, f"/documents/{doc.id}")
    else:
        _stage(db, version, "comparing", 40)
        counts = _apply_revision(db, version, live, candidates, alloc, service, progress)

    version.status = "ready"
    version.stage = "done"
    version.progress = 100
    version.error = None
    version.processed_at = datetime.now(timezone.utc)
    version.analysis_source = "ai" if counts["ai"] and not counts["demo"] else ("demo" if not counts["ai"] else "mixed")
    doc.current_version = max(doc.current_version, vno)
    log_activity(db, "document_processed",
                 f"{doc.title} v{vno} processed — {result.page_count} pages, {len(candidates)} requirement statements",
                 project_id, f"/documents/{doc.id}")
    db.commit()


def _active_tests(req: Requirement) -> list:
    return [t for t in req.test_cases if t.status != "obsolete"]


def _apply_revision(db, version, live, candidates, alloc, service, progress) -> dict[str, int]:
    doc = version.document
    vno = version.version_number
    live_by_key = {str(r.id): r for r in live}
    old_items = [
        Item(str(r.id), r.source_text or r.description, r.external_id, r.section, r.priority, r.category,
             len(_active_tests(r)))
        for r in live
    ]
    new_items = [Item(str(i), c.text, c.external_id, c.section) for i, c in enumerate(candidates)]
    changes = compare(old_items, new_items)

    change_set = ChangeSet(document_id=doc.id, from_version=doc.current_version, to_version=vno)
    db.add(change_set)
    to_analyze: list[Requirement] = []
    hints: dict[int, str | None] = {}
    rows: list[tuple[RequirementChange, Requirement | None, object]] = []

    for pos, ch in enumerate(changes):
        cand = candidates[int(ch.new.key)] if ch.new else None
        req = live_by_key.get(ch.old.key) if ch.old else None
        affected = 0
        if ch.change_type == "unchanged":
            assert req and cand
            req.section, req.page = cand.section[:300], cand.page
            req.external_id = req.external_id or cand.external_id
        elif ch.change_type == "modified":
            assert req and cand
            req.source_text = cand.text
            req.description = cand.text
            req.section, req.page = cand.section[:300], cand.page
            req.external_id = cand.external_id or req.external_id
            req.last_changed_version = vno
            req.review_status = "draft"
            req.edited = False
            for tc in _active_tests(req):
                tc.status = "needs_review"
                affected += 1
            to_analyze.append(req)
            hints[id(req)] = cand.priority_hint
        elif ch.change_type == "added":
            assert cand
            req = _new_requirement(alloc, doc.project_id, doc.id, cand, vno)
            db.add(req)
            to_analyze.append(req)
            hints[id(req)] = cand.priority_hint
        else:  # removed
            assert req
            req.status = "removed"
            req.last_changed_version = vno
            for tc in _active_tests(req):
                tc.status = "obsolete"
                affected += 1

        rc = RequirementChange(
            position=pos, change_type=ch.change_type,
            old_text=ch.old.text if ch.old else "", new_text=ch.new.text if ch.new else "",
            similarity=ch.similarity, severity=ch.severity, signals=ch.signals, affected_tests=affected,
            section=(cand.section if cand else (req.section if req else ""))[:300],
        )
        change_set.changes.append(rc)
        rows.append((rc, req, ch))

    db.flush()
    counts = analyze_requirements(db, to_analyze, service, hints, progress)

    for rc, req, ch in rows:
        if req is not None:
            rc.requirement_id = req.id
            rc.requirement_code = req.code
        if ch.change_type == "added" and req is not None:
            ch.new.priority, ch.new.category = req.priority, req.category
            rc.severity = severity_for(ch)
            rc.impact = "New requirement — no test coverage yet. Generate tests to close the gap."
        elif ch.change_type == "modified":
            signal_txt = (" " + "; ".join(ch.signals) + ".") if ch.signals else ""
            tests = (f"{rc.affected_tests} linked test case(s) flagged for review."
                     if rc.affected_tests else "No linked tests — coverage gap remains.")
            rc.impact = f"{tests}{signal_txt} Analysis and acceptance criteria refreshed."
        elif ch.change_type == "removed":
            rc.impact = (f"{rc.affected_tests} test case(s) marked obsolete." if rc.affected_tests
                         else "Requirement retired; no linked tests.")

    type_counts = {k: 0 for k in ("added", "modified", "removed", "unchanged")}
    sev_counts = {k: 0 for k in ("critical", "high", "medium", "low")}
    for rc, _, _ in rows:
        type_counts[rc.change_type] += 1
        if rc.severity in sev_counts:
            sev_counts[rc.severity] += 1
    change_set.counts = type_counts
    change_set.severity_counts = sev_counts
    change_set.affected_tests = sum(rc.affected_tests for rc, _, _ in rows)

    briefs = [ChangeBrief(change_type=rc.change_type, code=rc.requirement_code, old_text=rc.old_text,
                          new_text=rc.new_text, severity=rc.severity, affected_tests=rc.affected_tests)
              for rc, _, _ in rows]
    summary, _src = service.summarize_changes(f"{doc.title} v{change_set.from_version} → v{vno}", briefs)
    change_set.impact_summary = summary

    changed = type_counts["added"] + type_counts["modified"] + type_counts["removed"]
    log_activity(db, "version_compared",
                 f"{doc.title} v{vno}: {changed} requirement change(s), {change_set.affected_tests} test(s) affected",
                 doc.project_id, f"/changes?document={doc.id}")
    return counts
