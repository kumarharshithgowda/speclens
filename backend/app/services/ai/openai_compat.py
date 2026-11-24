"""OpenAI-compatible chat-completions provider (OpenAI, OpenRouter, Groq, Ollama, vLLM, …)."""

from __future__ import annotations

import json
import logging
import re
import time

import httpx

from app.config import Settings
from app.services.ai import prompts
from app.services.ai.base import (
    Analysis,
    ChangeBrief,
    GeneratedTest,
    RequirementInput,
    TestContext,
)

log = logging.getLogger("speclens.ai")


class AIProviderError(Exception):
    pass


def parse_json_payload(content: str) -> dict:
    """Parse JSON from a model response, tolerating code fences and chatter."""
    text = content.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start == -1 or end <= start:
            raise AIProviderError("Model response did not contain JSON") from None
        try:
            data = json.loads(text[start : end + 1])
        except json.JSONDecodeError as exc:
            raise AIProviderError(f"Invalid JSON from model: {exc}") from exc
    if isinstance(data, list):
        data = {"results": data}
    if not isinstance(data, dict):
        raise AIProviderError("Unexpected JSON shape from model")
    return data


class OpenAICompatibleProvider:
    source = "ai"

    def __init__(self, settings: Settings, client: httpx.Client | None = None) -> None:
        self.settings = settings
        self.name = f"{settings.ai_model} via {httpx.URL(settings.ai_base_url).host}"
        self._client = client or httpx.Client(timeout=settings.ai_timeout_seconds)
        self._json_mode = True

    def _chat(self, system: str, user: str, attempts: int = 2) -> dict:
        url = self.settings.ai_base_url.rstrip("/") + "/chat/completions"
        headers = {"Authorization": f"Bearer {self.settings.ai_api_key}", "Content-Type": "application/json"}
        last_error: Exception | None = None
        for attempt in range(attempts):
            body: dict = {
                "model": self.settings.ai_model,
                "temperature": 0.2,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            }
            if self._json_mode:
                body["response_format"] = {"type": "json_object"}
            try:
                resp = self._client.post(url, json=body, headers=headers)
                if resp.status_code == 400 and self._json_mode and "response_format" in resp.text:
                    self._json_mode = False  # provider without JSON mode — retry plain
                    continue
                if resp.status_code in (401, 403):
                    raise AIProviderError("AI provider rejected the API key (HTTP %d)" % resp.status_code)
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"] or ""
                return parse_json_payload(content)
            except AIProviderError as exc:
                last_error = exc
                if "API key" in str(exc):
                    break
            except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
                last_error = exc
            time.sleep(0.6 * (attempt + 1))
        raise AIProviderError(str(last_error) if last_error else "AI request failed")

    def analyze(self, items: list[RequirementInput]) -> list[Analysis]:
        data = self._chat(prompts.ANALYZE_SYSTEM, prompts.analyze_user(items))
        results = data.get("results") or data.get("requirements") or []
        by_index: dict[int, Analysis] = {}
        for pos, raw in enumerate(results):
            if not isinstance(raw, dict):
                continue
            idx = raw.get("index", pos)
            try:
                by_index[int(idx)] = Analysis.model_validate(raw)
            except Exception as exc:  # validation of a single item
                log.warning("Discarding invalid analysis item %s: %s", idx, exc)
        if len(by_index) < len(items):
            raise AIProviderError(f"Model returned {len(by_index)} of {len(items)} analyses")
        return [by_index[i] for i in range(len(items))]

    def generate_tests(self, ctx: TestContext, types: list[str], per_type: int) -> list[GeneratedTest]:
        data = self._chat(prompts.TESTGEN_SYSTEM, prompts.testgen_user(ctx, types, per_type))
        raw_cases = data.get("test_cases") or data.get("results") or []
        cases: list[GeneratedTest] = []
        for raw in raw_cases:
            if isinstance(raw, dict):
                try:
                    cases.append(GeneratedTest.model_validate(raw))
                except Exception as exc:
                    log.warning("Discarding invalid test case: %s", exc)
        if not cases:
            raise AIProviderError("Model returned no valid test cases")
        return cases

    def summarize_changes(self, document: str, changes: list[ChangeBrief]) -> str:
        data = self._chat(prompts.SUMMARY_SYSTEM, prompts.summary_user(document, changes))
        summary = str(data.get("summary", "")).strip()
        if not summary:
            raise AIProviderError("Empty summary")
        return summary

    def ping(self) -> str:
        data = self._chat('Reply with JSON {"status":"ok"}.', "ping", attempts=1)
        return str(data.get("status", "ok"))
