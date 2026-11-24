from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.reports.datasets import DATASETS
from app.services.reports.render import RENDERERS

router = APIRouter(prefix="/reports", tags=["reports"])

Kind = Literal["requirements", "test-cases", "changes", "traceability"]
Fmt = Literal["csv", "xlsx", "pdf"]


@router.get("/{kind}.{fmt}")
def download_report(
    kind: Kind,
    fmt: Fmt,
    project_id: int | None = None,
    change_set_id: int | None = None,
    db: Session = Depends(get_db),
):
    builder = DATASETS[kind]
    ds = builder(db, project_id, change_set_id) if kind == "changes" else builder(db, project_id)
    render, media = RENDERERS[fmt]
    scope = re.sub(r"[^a-z0-9]+", "-", ds.subtitle.lower()).strip("-")[:40] or "all"
    filename = f"speclens-{kind}-{scope}-{datetime.now():%Y%m%d}.{fmt}"
    return Response(
        content=render(ds), media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
