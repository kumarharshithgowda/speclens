"""Applying analysis results to requirement records."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AcceptanceCriterion, Requirement
from app.services.ai import Analysis, IntelligenceService, RequirementInput
from app.services.common import criterion_code


def apply_analysis(req: Requirement, analysis: Analysis, source: str, keep_title: bool = False) -> None:
    if not keep_title:
        req.title = analysis.title
    req.category = analysis.category
    req.priority = analysis.priority
    req.risk = analysis.risk
    req.complexity = analysis.complexity
    req.testable = analysis.testable
    req.ambiguity_score = analysis.ambiguity_score
    req.ambiguity_notes = analysis.ambiguity_notes
    req.clarification = analysis.clarification
    req.rationale = analysis.rationale
    req.analysis_source = source
    set_criteria(req, analysis.acceptance_criteria)


def set_criteria(req: Requirement, texts: list[str]) -> None:
    """Replace criteria text in place (keeps test-case links by position)."""
    texts = [t.strip() for t in texts if t and t.strip()]
    existing = list(req.criteria)
    for pos, text in enumerate(texts):
        if pos < len(existing):
            existing[pos].text = text
            existing[pos].position = pos
            existing[pos].code = criterion_code(req.code, pos)
        else:
            req.criteria.append(AcceptanceCriterion(code=criterion_code(req.code, pos), text=text, position=pos))
    for extra in existing[len(texts):]:
        for tc in list(extra.test_cases):
            tc.criterion_id = None
        req.criteria.remove(extra)


def analyze_requirements(
    db: Session,
    reqs: list[Requirement],
    service: IntelligenceService,
    hints: dict[int, str | None] | None = None,
    on_progress=None,
) -> dict[str, int]:
    """Analyse requirements in batches; returns a count per source."""
    counts = {"ai": 0, "demo": 0}
    batch = max(1, service.settings.ai_batch_size)
    hints = hints or {}
    for start in range(0, len(reqs), batch):
        chunk = reqs[start : start + batch]
        inputs = [RequirementInput(text=r.description, section=r.section, priority_hint=hints.get(id(r))) for r in chunk]
        results, source = service.analyze(inputs)
        for req, analysis in zip(chunk, results):
            apply_analysis(req, analysis, source, keep_title=req.edited)
        counts[source] += len(chunk)
        db.flush()
        if on_progress:
            on_progress(min(start + batch, len(reqs)), len(reqs))
    return counts
