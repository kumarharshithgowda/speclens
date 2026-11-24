"""Test configuration: isolated SQLite database and upload folder, demo AI only."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

_TMP = Path(tempfile.mkdtemp(prefix="speclens-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{(_TMP / 'test.db').as_posix()}"
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["SEED_DEMO_DATA"] = "false"
os.environ["AI_API_KEY"] = ""

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.deps import get_intelligence  # noqa: E402
from app.main import app  # noqa: E402
from app.seed.sample_docs import ensure_samples  # noqa: E402
from app.services.ai import IntelligenceService  # noqa: E402
from app.services.ai.demo import DemoProvider  # noqa: E402


@pytest.fixture(scope="session")
def samples() -> dict[str, Path]:
    return ensure_samples(_TMP / "samples")


@pytest.fixture()
def client():
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides[get_intelligence] = lambda: IntelligenceService(provider=DemoProvider())
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
