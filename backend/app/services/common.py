"""Small shared helpers: sequential codes and the activity log."""

from __future__ import annotations

import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Activity, Requirement, TestCase


def _next_number(codes: list[str], prefix: str) -> int:
    best = 0
    for code in codes:
        m = re.match(rf"{prefix}-(\d+)$", code or "")
        if m:
            best = max(best, int(m.group(1)))
    return best + 1


class CodeAllocator:
    """Hands out REQ-### / TC-#### codes per project within one unit of work."""

    def __init__(self, db: Session, project_id: int) -> None:
        self.db = db
        self.project_id = project_id
        self._req: int | None = None
        self._tc: int | None = None

    def requirement(self) -> str:
        if self._req is None:
            codes = self.db.scalars(select(Requirement.code).where(Requirement.project_id == self.project_id)).all()
            self._req = _next_number(list(codes), "REQ")
        code = f"REQ-{self._req:03d}"
        self._req += 1
        return code

    def test_case(self) -> str:
        if self._tc is None:
            codes = self.db.scalars(select(TestCase.code).where(TestCase.project_id == self.project_id)).all()
            self._tc = _next_number(list(codes), "TC")
        code = f"TC-{self._tc:04d}"
        self._tc += 1
        return code


def criterion_code(req_code: str, position: int) -> str:
    return f"AC-{req_code.split('-')[-1]}.{position + 1}"


def log_activity(db: Session, kind: str, message: str, project_id: int | None = None, link: str = "") -> None:
    db.add(Activity(kind=kind, message=message[:400], project_id=project_id, link=link))
