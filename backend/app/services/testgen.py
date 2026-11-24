"""Test case generation and regeneration."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Requirement, TestCase
from app.services.ai import GeneratedTest, IntelligenceService, TestContext
from app.services.common import CodeAllocator, log_activity


def context_for(req: Requirement) -> TestContext:
    return TestContext(
        code=req.code, title=req.title, text=req.description, category=req.category,
        priority=req.priority, section=req.section, acceptance_criteria=[c.text for c in req.criteria],
    )


def _criterion_id(req: Requirement, idx: int | None) -> int | None:
    if idx is None or not req.criteria:
        return None
    return req.criteria[idx].id if 0 <= idx < len(req.criteria) else None


def _fill(tc: TestCase, gen: GeneratedTest, req: Requirement, source: str) -> None:
    tc.title = gen.title[:250]
    tc.scenario = gen.scenario
    tc.preconditions = gen.preconditions
    tc.steps = gen.steps
    tc.expected_result = gen.expected_result
    tc.test_type = gen.test_type
    tc.priority = gen.priority
    tc.test_data = gen.test_data
    tc.criterion_id = _criterion_id(req, gen.criterion_index)
    tc.source = source
    tc.status = "draft"


def generate_for_requirements(
    db: Session,
    reqs: list[Requirement],
    types: list[str],
    per_type: int,
    service: IntelligenceService,
    replace_existing: bool = False,
) -> tuple[list[TestCase], dict[str, int]]:
    created: list[TestCase] = []
    sources = {"ai": 0, "demo": 0}
    allocators: dict[int, CodeAllocator] = {}
    for req in reqs:
        if replace_existing:
            for old in list(req.test_cases):
                db.delete(old)
            db.flush()
        alloc = allocators.setdefault(req.project_id, CodeAllocator(db, req.project_id))
        generated, source = service.generate_tests(context_for(req), types, per_type)
        for gen in generated:
            tc = TestCase(project_id=req.project_id, requirement_id=req.id, code=alloc.test_case())
            _fill(tc, gen, req, source)
            req.test_cases.append(tc)
            created.append(tc)
            sources[source] += 1
    db.flush()
    if created:
        projects = {r.project_id for r in reqs}
        for pid in projects:
            n = sum(1 for t in created if t.project_id == pid)
            label = "AI" if sources["ai"] and not sources["demo"] else "demo engine"
            log_activity(db, "tests_generated",
                         f"Generated {n} test case(s) for {len([r for r in reqs if r.project_id == pid])} requirement(s) via {label}",
                         pid, "/test-cases")
    return created, sources


def regenerate(db: Session, tc: TestCase, service: IntelligenceService) -> str:
    req = tc.requirement
    generated, source = service.generate_tests(context_for(req), [tc.test_type], 1)
    _fill(tc, generated[0], req, source)
    db.flush()
    return source
