"""SQLAlchemy ORM models.

Enumerations are stored as short strings (validated at the API layer) so the
schema stays portable between SQLite and PostgreSQL.
"""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Project(TimestampMixin, Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(20), default="teal")
    status: Mapped[str] = mapped_column(String(20), default="active")

    documents: Mapped[list[Document]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="Document.id"
    )
    requirements: Mapped[list[Requirement]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    test_cases: Mapped[list[TestCase]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    activities: Mapped[list[Activity]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Document(TimestampMixin, Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    doc_type: Mapped[str] = mapped_column(String(40), default="SRS")
    current_version: Mapped[int] = mapped_column(Integer, default=0)

    project: Mapped[Project] = relationship(back_populates="documents")
    versions: Mapped[list[DocumentVersion]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        order_by="DocumentVersion.version_number",
    )
    requirements: Mapped[list[Requirement]] = relationship(back_populates="document")
    change_sets: Mapped[list[ChangeSet]] = relationship(
        back_populates="document", cascade="all, delete-orphan", order_by="ChangeSet.id"
    )


class DocumentVersion(Base):
    __tablename__ = "document_versions"
    __table_args__ = (UniqueConstraint("document_id", "version_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer)
    label: Mapped[str] = mapped_column(String(60), default="")
    filename: Mapped[str] = mapped_column(String(255))
    file_path: Mapped[str] = mapped_column(String(500))
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    stage: Mapped[str] = mapped_column(String(40), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    stats: Mapped[dict] = mapped_column(JSON, default=dict)
    snapshot: Mapped[list] = mapped_column(JSON, default=list)
    analysis_source: Mapped[str] = mapped_column(String(10), default="demo")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    document: Mapped[Document] = relationship(back_populates="versions")
    sections: Mapped[list[Section]] = relationship(
        back_populates="version", cascade="all, delete-orphan", order_by="Section.position"
    )


class Section(Base):
    __tablename__ = "sections"
    __table_args__ = (Index("ix_sections_version_pos", "version_id", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("document_versions.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(20))  # heading|paragraph|list|table|statement
    level: Mapped[int] = mapped_column(Integer, default=0)
    heading_path: Mapped[str] = mapped_column(String(500), default="")
    text: Mapped[str] = mapped_column(Text, default="")
    page: Mapped[int] = mapped_column(Integer, default=1)
    table: Mapped[list | None] = mapped_column(JSON, nullable=True)
    is_requirement: Mapped[bool] = mapped_column(Boolean, default=False)

    version: Mapped[DocumentVersion] = relationship(back_populates="sections")


class Requirement(TimestampMixin, Base):
    __tablename__ = "requirements"
    __table_args__ = (
        UniqueConstraint("project_id", "code"),
        Index("ix_requirements_doc_status", "document_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[int | None] = mapped_column(
        ForeignKey("documents.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(20))
    external_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    source_text: Mapped[str] = mapped_column(Text, default="")
    section: Mapped[str] = mapped_column(String(300), default="")
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    category: Mapped[str] = mapped_column(String(30), default="Functional")
    priority: Mapped[str] = mapped_column(String(10), default="Medium")
    risk: Mapped[str] = mapped_column(String(10), default="Medium")
    complexity: Mapped[str] = mapped_column(String(10), default="Medium")
    testable: Mapped[bool] = mapped_column(Boolean, default=True)
    ambiguity_score: Mapped[float] = mapped_column(Float, default=0.0)
    ambiguity_notes: Mapped[str] = mapped_column(Text, default="")
    clarification: Mapped[str] = mapped_column(Text, default="")
    rationale: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(12), default="active")  # active|removed
    review_status: Mapped[str] = mapped_column(String(12), default="draft")  # draft|reviewed|approved
    analysis_source: Mapped[str] = mapped_column(String(10), default="demo")  # ai|demo|manual
    introduced_version: Mapped[int] = mapped_column(Integer, default=1)
    last_changed_version: Mapped[int] = mapped_column(Integer, default=1)
    edited: Mapped[bool] = mapped_column(Boolean, default=False)

    project: Mapped[Project] = relationship(back_populates="requirements")
    document: Mapped[Document | None] = relationship(back_populates="requirements")
    criteria: Mapped[list[AcceptanceCriterion]] = relationship(
        back_populates="requirement",
        cascade="all, delete-orphan",
        order_by="AcceptanceCriterion.position",
    )
    test_cases: Mapped[list[TestCase]] = relationship(
        back_populates="requirement", cascade="all, delete-orphan", order_by="TestCase.id"
    )


class AcceptanceCriterion(Base):
    __tablename__ = "acceptance_criteria"

    id: Mapped[int] = mapped_column(primary_key=True)
    requirement_id: Mapped[int] = mapped_column(
        ForeignKey("requirements.id", ondelete="CASCADE"), index=True
    )
    code: Mapped[str] = mapped_column(String(30))
    text: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0)

    requirement: Mapped[Requirement] = relationship(back_populates="criteria")
    test_cases: Mapped[list[TestCase]] = relationship(back_populates="criterion")


class TestCase(TimestampMixin, Base):
    __tablename__ = "test_cases"
    __table_args__ = (UniqueConstraint("project_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    requirement_id: Mapped[int] = mapped_column(
        ForeignKey("requirements.id", ondelete="CASCADE"), index=True
    )
    criterion_id: Mapped[int | None] = mapped_column(
        ForeignKey("acceptance_criteria.id", ondelete="SET NULL"), nullable=True
    )
    code: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(250))
    scenario: Mapped[str] = mapped_column(Text, default="")
    preconditions: Mapped[list] = mapped_column(JSON, default=list)
    steps: Mapped[list] = mapped_column(JSON, default=list)
    expected_result: Mapped[str] = mapped_column(Text, default="")
    test_type: Mapped[str] = mapped_column(String(20), default="positive")
    priority: Mapped[str] = mapped_column(String(10), default="Medium")
    test_data: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(15), default="draft")
    source: Mapped[str] = mapped_column(String(10), default="demo")

    project: Mapped[Project] = relationship(back_populates="test_cases")
    requirement: Mapped[Requirement] = relationship(back_populates="test_cases")
    criterion: Mapped[AcceptanceCriterion | None] = relationship(back_populates="test_cases")


class ChangeSet(Base):
    __tablename__ = "change_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    from_version: Mapped[int] = mapped_column(Integer)
    to_version: Mapped[int] = mapped_column(Integer)
    counts: Mapped[dict] = mapped_column(JSON, default=dict)
    severity_counts: Mapped[dict] = mapped_column(JSON, default=dict)
    impact_summary: Mapped[str] = mapped_column(Text, default="")
    affected_tests: Mapped[int] = mapped_column(Integer, default=0)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    document: Mapped[Document] = relationship(back_populates="change_sets")
    changes: Mapped[list[RequirementChange]] = relationship(
        back_populates="change_set", cascade="all, delete-orphan", order_by="RequirementChange.position"
    )


class RequirementChange(Base):
    __tablename__ = "requirement_changes"

    id: Mapped[int] = mapped_column(primary_key=True)
    change_set_id: Mapped[int] = mapped_column(ForeignKey("change_sets.id", ondelete="CASCADE"), index=True)
    requirement_id: Mapped[int | None] = mapped_column(
        ForeignKey("requirements.id", ondelete="SET NULL"), nullable=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    change_type: Mapped[str] = mapped_column(String(12))  # added|modified|removed|unchanged
    requirement_code: Mapped[str] = mapped_column(String(20), default="")
    section: Mapped[str] = mapped_column(String(300), default="")
    old_text: Mapped[str] = mapped_column(Text, default="")
    new_text: Mapped[str] = mapped_column(Text, default="")
    similarity: Mapped[float] = mapped_column(Float, default=0.0)
    severity: Mapped[str] = mapped_column(String(10), default="none")
    impact: Mapped[str] = mapped_column(Text, default="")
    signals: Mapped[list] = mapped_column(JSON, default=list)
    affected_tests: Mapped[int] = mapped_column(Integer, default=0)

    change_set: Mapped[ChangeSet] = relationship(back_populates="changes")


class Activity(Base):
    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=True, index=True
    )
    kind: Mapped[str] = mapped_column(String(30))
    message: Mapped[str] = mapped_column(String(400))
    link: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)

    project: Mapped[Project | None] = relationship(back_populates="activities")
