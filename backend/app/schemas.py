"""Pydantic request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ProjectStatus = Literal["active", "on_hold", "completed", "archived"]
ProjectColor = Literal["teal", "indigo", "amber", "rose", "sky", "violet", "emerald", "slate"]
Level = Literal["Low", "Medium", "High", "Critical"]
Complexity = Literal["Low", "Medium", "High"]
Category = Literal[
    "Functional", "Security", "Performance", "Reliability", "Usability",
    "Compliance", "Data", "Integration", "Reporting", "Notification",
]
ReviewStatus = Literal["draft", "reviewed", "approved"]
TestType = Literal["positive", "negative", "edge_case", "functional", "regression"]
TestStatus = Literal["draft", "ready", "needs_review", "obsolete"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _strip(v: str | None) -> str | None:
    return v.strip() if isinstance(v, str) else v


# ---------------------------------------------------------------- projects
class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field("", max_length=2000)
    color: ProjectColor = "teal"
    status: ProjectStatus = "active"

    _s = field_validator("name", "description")(_strip)


class ProjectUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    description: str | None = Field(None, max_length=2000)
    color: ProjectColor | None = None
    status: ProjectStatus | None = None

    _s = field_validator("name", "description")(_strip)


class ProjectStats(BaseModel):
    documents: int = 0
    requirements: int = 0
    test_cases: int = 0
    coverage_pct: float = 0.0
    open_alerts: int = 0
    needs_review: int = 0


class ProjectOut(ORM):
    id: int
    name: str
    description: str
    color: str
    status: str
    created_at: datetime
    updated_at: datetime
    stats: ProjectStats = ProjectStats()


# --------------------------------------------------------------- documents
class VersionOut(ORM):
    id: int
    document_id: int
    version_number: int
    label: str
    filename: str
    file_size: int
    page_count: int
    status: str
    stage: str
    progress: int
    error: str | None
    stats: dict
    analysis_source: str
    uploaded_at: datetime
    processed_at: datetime | None


class DocumentOut(ORM):
    id: int
    project_id: int
    project_name: str = ""
    title: str
    doc_type: str
    current_version: int
    created_at: datetime
    updated_at: datetime
    latest_version: VersionOut | None = None
    version_count: int = 0
    requirement_count: int = 0


class DocumentDetail(DocumentOut):
    versions: list[VersionOut] = []


class DocumentUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=200)
    doc_type: str | None = Field(None, max_length=40)
    project_id: int | None = None


class SectionOut(ORM):
    id: int
    position: int
    kind: str
    level: int
    heading_path: str
    text: str
    page: int
    table: list | None
    is_requirement: bool


# ------------------------------------------------------------ requirements
class CriterionOut(ORM):
    id: int
    code: str
    text: str
    position: int


class RequirementOut(ORM):
    id: int
    project_id: int
    document_id: int | None
    document_title: str | None = None
    code: str
    external_id: str | None
    title: str
    description: str
    source_text: str
    section: str
    page: int | None
    category: str
    priority: str
    risk: str
    complexity: str
    testable: bool
    ambiguity_score: float
    ambiguity_notes: str
    clarification: str
    rationale: str
    status: str
    review_status: str
    analysis_source: str
    introduced_version: int
    last_changed_version: int
    edited: bool
    created_at: datetime
    updated_at: datetime
    criteria: list[CriterionOut] = []
    test_count: int = 0
    needs_review: int = 0


class RequirementCreate(BaseModel):
    project_id: int
    document_id: int | None = None
    description: str = Field(min_length=10, max_length=2000)
    title: str | None = Field(None, max_length=200)
    section: str = Field("", max_length=300)
    analyze: bool = True

    _s = field_validator("description", "title")(_strip)


class RequirementUpdate(BaseModel):
    title: str | None = Field(None, min_length=2, max_length=200)
    description: str | None = Field(None, min_length=10, max_length=2000)
    section: str | None = Field(None, max_length=300)
    category: Category | None = None
    priority: Level | None = None
    risk: Level | None = None
    complexity: Complexity | None = None
    testable: bool | None = None
    review_status: ReviewStatus | None = None
    ambiguity_notes: str | None = Field(None, max_length=2000)
    clarification: str | None = Field(None, max_length=2000)

    _s = field_validator("title", "description")(_strip)


class CriteriaUpdate(BaseModel):
    criteria: list[str] = Field(max_length=12)

    @field_validator("criteria")
    @classmethod
    def _clean(cls, v: list[str]) -> list[str]:
        out = [c.strip() for c in v if c and c.strip()]
        if any(len(c) > 1000 for c in out):
            raise ValueError("Each criterion must be at most 1000 characters")
        return out


# -------------------------------------------------------------- test cases
class TestCaseOut(ORM):
    id: int
    project_id: int
    requirement_id: int
    requirement_code: str = ""
    requirement_title: str = ""
    criterion_id: int | None
    criterion_code: str | None = None
    code: str
    title: str
    scenario: str
    preconditions: list[str]
    steps: list[str]
    expected_result: str
    test_type: str
    priority: str
    test_data: str
    status: str
    source: str
    created_at: datetime
    updated_at: datetime


class TestCaseCreate(BaseModel):
    requirement_id: int
    criterion_id: int | None = None
    title: str = Field(min_length=3, max_length=250)
    scenario: str = Field("", max_length=2000)
    preconditions: list[str] = Field(default_factory=list, max_length=20)
    steps: list[str] = Field(default_factory=list, max_length=40)
    expected_result: str = Field("", max_length=2000)
    test_type: TestType = "positive"
    priority: Level = "Medium"
    test_data: str = Field("", max_length=2000)
    status: TestStatus = "draft"


class TestCaseUpdate(BaseModel):
    criterion_id: int | None = None
    title: str | None = Field(None, min_length=3, max_length=250)
    scenario: str | None = Field(None, max_length=2000)
    preconditions: list[str] | None = Field(None, max_length=20)
    steps: list[str] | None = Field(None, max_length=40)
    expected_result: str | None = Field(None, max_length=2000)
    test_type: TestType | None = None
    priority: Level | None = None
    test_data: str | None = Field(None, max_length=2000)
    status: TestStatus | None = None


class GenerateRequest(BaseModel):
    requirement_ids: list[int] = Field(min_length=1, max_length=200)
    types: list[TestType] = Field(default_factory=lambda: ["positive", "negative", "edge_case"], min_length=1)
    per_type: int = Field(1, ge=1, le=3)
    replace_existing: bool = False


class GenerateResult(BaseModel):
    created: int
    source: str
    test_cases: list[TestCaseOut]


class BulkIds(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=1000)


# ----------------------------------------------------------------- changes
class RequirementChangeOut(ORM):
    id: int
    requirement_id: int | None
    requirement_code: str
    position: int
    change_type: str
    section: str
    old_text: str
    new_text: str
    similarity: float
    severity: str
    impact: str
    signals: list[str]
    affected_tests: int
    diff: list[dict] = []


class ChangeSetOut(ORM):
    id: int
    document_id: int
    document_title: str = ""
    project_id: int | None = None
    project_name: str = ""
    from_version: int
    to_version: int
    counts: dict
    severity_counts: dict
    impact_summary: str
    affected_tests: int
    acknowledged: bool
    created_at: datetime


class ChangeSetDetail(ChangeSetOut):
    changes: list[RequirementChangeOut] = []
