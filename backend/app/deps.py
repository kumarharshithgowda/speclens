"""Shared FastAPI dependencies."""

from __future__ import annotations

from app.services.ai import IntelligenceService


def get_intelligence() -> IntelligenceService:
    return IntelligenceService()
