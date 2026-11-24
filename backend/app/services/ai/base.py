"""Provider-agnostic types for requirement analysis and test generation."""

from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, Field, field_validator

CATEGORIES = [
    "Functional", "Security", "Performance", "Reliability", "Usability",
    "Compliance", "Data", "Integration", "Reporting", "Notification",
]
LEVELS = ["Low", "Medium", "High", "Critical"]
COMPLEXITY = ["Low", "Medium", "High"]
TEST_TYPES = ["positive", "negative", "edge_case", "functional", "regression"]

Source = Literal["ai", "demo"]


def _pick(value: object, allowed: list[str], default: str) -> str:
    text = str(value or "").strip().replace(" ", "_" if allowed is TEST_TYPES else " ")
    for option in allowed:
        if option.lower() == text.lower():
            return option
    for option in allowed:
        if text.lower().startswith(option.lower()[:4]):
            return option
    return default


def _as_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = [p.strip(" -•\t") for p in value.split("\n")]
        return [p for p in parts if p]
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [str(value)]


class RequirementInput(BaseModel):
    text: str
    section: str = ""
    priority_hint: str | None = None


class Analysis(BaseModel):
    title: str
    category: str = "Functional"
    priority: str = "Medium"
    risk: str = "Medium"
    complexity: str = "Medium"
    testable: bool = True
    ambiguity_score: float = Field(0.0, ge=0, le=1)
    ambiguity_notes: str = ""
    clarification: str = ""
    rationale: str = ""
    acceptance_criteria: list[str] = Field(default_factory=list)

    @field_validator("category", mode="before")
    @classmethod
    def _cat(cls, v: object) -> str:
        return _pick(v, CATEGORIES, "Functional")

    @field_validator("priority", "risk", mode="before")
    @classmethod
    def _lvl(cls, v: object) -> str:
        return _pick(v, LEVELS, "Medium")

    @field_validator("complexity", mode="before")
    @classmethod
    def _cx(cls, v: object) -> str:
        return _pick(v, COMPLEXITY, "Medium")

    @field_validator("ambiguity_score", mode="before")
    @classmethod
    def _amb(cls, v: object) -> float:
        try:
            f = float(v)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return 0.0
        return max(0.0, min(1.0, f / 100 if f > 1 else f))

    @field_validator("acceptance_criteria", mode="before")
    @classmethod
    def _ac(cls, v: object) -> list[str]:
        return _as_list(v)[:6]

    @field_validator("title", mode="before")
    @classmethod
    def _title(cls, v: object) -> str:
        return str(v or "Untitled requirement").strip()[:190]


class TestContext(BaseModel):
    code: str
    title: str
    text: str
    category: str = "Functional"
    priority: str = "Medium"
    section: str = ""
    acceptance_criteria: list[str] = Field(default_factory=list)


class GeneratedTest(BaseModel):
    title: str
    scenario: str = ""
    preconditions: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    expected_result: str = ""
    test_type: str = "positive"
    priority: str = "Medium"
    test_data: str = ""
    criterion_index: int | None = None

    @field_validator("preconditions", "steps", mode="before")
    @classmethod
    def _lists(cls, v: object) -> list[str]:
        return _as_list(v)

    @field_validator("test_type", mode="before")
    @classmethod
    def _type(cls, v: object) -> str:
        return _pick(v, TEST_TYPES, "functional")

    @field_validator("priority", mode="before")
    @classmethod
    def _prio(cls, v: object) -> str:
        return _pick(v, LEVELS, "Medium")

    @field_validator("test_data", "expected_result", "scenario", mode="before")
    @classmethod
    def _str(cls, v: object) -> str:
        if isinstance(v, (list, dict)):
            import json

            return json.dumps(v) if isinstance(v, dict) else "; ".join(map(str, v))
        return str(v or "")

    @field_validator("criterion_index", mode="before")
    @classmethod
    def _idx(cls, v: object) -> int | None:
        try:
            return int(v) if v is not None and v != "" else None  # type: ignore[arg-type]
        except (TypeError, ValueError):
            return None


class ChangeBrief(BaseModel):
    change_type: str
    code: str
    old_text: str = ""
    new_text: str = ""
    severity: str = "none"
    affected_tests: int = 0


class AIProvider(Protocol):
    source: Source
    name: str

    def analyze(self, items: list[RequirementInput]) -> list[Analysis]: ...

    def generate_tests(
        self, ctx: TestContext, types: list[str], per_type: int
    ) -> list[GeneratedTest]: ...

    def summarize_changes(self, document: str, changes: list[ChangeBrief]) -> str: ...
