"""Application settings, loaded from environment variables / .env."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", BACKEND_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "SpecLens"
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'data' / 'speclens.db').as_posix()}"
    upload_dir: Path = BACKEND_DIR / "data" / "uploads"
    max_upload_mb: int = 25
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # AI provider (OpenAI-compatible). Leave the key empty to run in demo mode.
    ai_api_key: str = ""
    ai_base_url: str = "https://api.openai.com/v1"
    ai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: float = 60.0
    ai_batch_size: int = 12

    # Seed realistic demo data on first start when the database is empty.
    seed_demo_data: bool = True

    @property
    def ai_enabled(self) -> bool:
        return bool(self.ai_api_key.strip())

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
