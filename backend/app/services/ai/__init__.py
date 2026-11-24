"""AI provider selection with transparent demo fallback.

``IntelligenceService`` is what the rest of the app uses.  Every call returns
the results *and* the source that produced them (``"ai"`` or ``"demo"``), so
results can be labelled honestly in the UI.  If the AI provider fails for a
batch, that batch falls back to the deterministic demo engine.
"""

from __future__ import annotations

import logging

from app.config import Settings, get_settings
from app.services.ai.base import (
    Analysis,
    ChangeBrief,
    GeneratedTest,
    RequirementInput,
    TestContext,
)
from app.services.ai.demo import DemoProvider
from app.services.ai.openai_compat import OpenAICompatibleProvider

log = logging.getLogger("speclens.ai")


class IntelligenceService:
    def __init__(self, settings: Settings | None = None, provider=None) -> None:
        self.settings = settings or get_settings()
        self.demo = DemoProvider()
        if provider is not None:
            self.provider = provider
        elif self.settings.ai_enabled:
            self.provider = OpenAICompatibleProvider(self.settings)
        else:
            self.provider = self.demo
        self.last_error: str | None = None

    @property
    def mode(self) -> str:
        return self.provider.source

    def analyze(self, items: list[RequirementInput]) -> tuple[list[Analysis], str]:
        if not items:
            return [], self.mode
        if self.provider.source == "ai":
            try:
                return self.provider.analyze(items), "ai"
            except Exception as exc:
                self.last_error = str(exc)
                log.warning("AI analysis failed, falling back to demo engine: %s", exc)
        return self.demo.analyze(items), "demo"

    def generate_tests(
        self, ctx: TestContext, types: list[str], per_type: int
    ) -> tuple[list[GeneratedTest], str]:
        if self.provider.source == "ai":
            try:
                return self.provider.generate_tests(ctx, types, per_type), "ai"
            except Exception as exc:
                self.last_error = str(exc)
                log.warning("AI test generation failed, falling back to demo engine: %s", exc)
        return self.demo.generate_tests(ctx, types, per_type), "demo"

    def summarize_changes(self, document: str, changes: list[ChangeBrief]) -> tuple[str, str]:
        if self.provider.source == "ai" and any(c.change_type != "unchanged" for c in changes):
            try:
                return self.provider.summarize_changes(document, changes), "ai"
            except Exception as exc:
                self.last_error = str(exc)
        return self.demo.summarize_changes(document, changes), "demo"


__all__ = [
    "Analysis", "ChangeBrief", "GeneratedTest", "IntelligenceService", "RequirementInput", "TestContext",
]
