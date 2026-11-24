from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.config import get_settings
from app.seed.sample_docs import SAMPLES
from app.seed.seeder import SAMPLES_DIR, reset_and_seed
from app.services.ai.openai_compat import OpenAICompatibleProvider

router = APIRouter(tags=["system"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/settings")
def get_app_settings():
    s = get_settings()
    from httpx import URL

    return {
        "app_name": s.app_name,
        "ai": {
            "mode": "ai" if s.ai_enabled else "demo",
            "configured": s.ai_enabled,
            "model": s.ai_model if s.ai_enabled else None,
            "provider_host": URL(s.ai_base_url).host if s.ai_enabled else None,
            "batch_size": s.ai_batch_size,
        },
        "limits": {"max_upload_mb": s.max_upload_mb},
        "database": "postgresql" if s.database_url.startswith("postgres") else "sqlite",
        "samples": [{"name": n, "title": t, "subtitle": st} for n, (t, st, _) in SAMPLES.items()],
    }


@router.post("/settings/test-ai")
def test_ai():
    s = get_settings()
    if not s.ai_enabled:
        return {"ok": False, "mode": "demo", "message": "No AI_API_KEY configured — SpecLens is running in demo mode."}
    started = time.perf_counter()
    try:
        OpenAICompatibleProvider(s).ping()
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "mode": "ai", "message": str(exc)}
    return {"ok": True, "mode": "ai", "message": f"Connected to {s.ai_model}",
            "latency_ms": round((time.perf_counter() - started) * 1000)}


@router.post("/settings/reset-demo")
def reset_demo():
    reset_and_seed()
    return {"ok": True}


@router.get("/samples/{name}")
def download_sample(name: str):
    if name not in SAMPLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sample not found")
    path = SAMPLES_DIR / name
    if not path.exists():
        from app.seed.sample_docs import ensure_samples

        ensure_samples(SAMPLES_DIR)
    return FileResponse(path, media_type="application/pdf", filename=name)
