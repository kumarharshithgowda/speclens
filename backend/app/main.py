"""SpecLens API entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.config import BACKEND_DIR, get_settings
from app.database import init_db
from app.routers import changes, documents, insights, projects, reports, requirements, system, testcases

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("speclens")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    init_db()
    if settings.seed_demo_data:
        from app.seed.seeder import is_empty, seed_demo

        if is_empty():
            log.info("Empty database — seeding demo workspace")
            seed_demo()
    log.info("SpecLens ready (AI mode: %s)", "AI" if settings.ai_enabled else "demo")
    yield


app = FastAPI(
    title="SpecLens API",
    version="1.0.0",
    description="Requirements intelligence: extraction, change analysis, test generation and traceability.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_handler(_request: Request, exc: RequestValidationError):
    errors = exc.errors()
    first = errors[0] if errors else {}
    field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
    return JSONResponse(
        status_code=422,
        content={"detail": f"{field}: {first.get('msg', 'Invalid input')}", "errors": jsonable(errors)},
    )


def jsonable(errors: list) -> list:
    return [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in errors]


for module in (system, insights, projects, documents, requirements, changes, testcases, reports):
    app.include_router(module.router, prefix="/api")

# Serve the built frontend (frontend/dist) when present — single-process demo mode.
DIST = BACKEND_DIR.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        candidate = DIST / full_path
        if full_path and candidate.is_file() and DIST in candidate.resolve().parents:
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
