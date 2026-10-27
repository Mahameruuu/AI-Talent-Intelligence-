"""Database models. All tables are prefixed with ``ti_`` (Talent Intelligence)."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Actor(TimestampMixin, db.Model):
    """Who did something in HR (attribution only — there are no logins in this service).

    Found or created from the optional ``X-Actor-Name`` / ``X-Actor-Id`` request headers sent by the central system;
    without them the built-in actor "HR" is used. The table keeps its historical name ``ti_users`` so existing
    history rows keep their references.
    """

    __tablename__ = "ti_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Free-text identifier from the central system (X-Actor-Id); unique when present.
    external_id: Mapped[str | None] = mapped_column(String(255), unique=True)


class Job(TimestampMixin, db.Model):
    __tablename__ = "ti_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    department: Mapped[str | None] = mapped_column(String(255))
    location: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    min_experience_years: Mapped[float | None] = mapped_column(Float)
    education_level: Mapped[str | None] = mapped_column(String(20))
    education_field: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="open", nullable=False)
    # full_time | part_time | contract | internship | freelance
    employment_type: Mapped[str] = mapped_column(String(20), nullable=False, default="full_time",
                                                 server_default="full_time")
    # Monthly salary range in IDR (optional). Shown to applicants only when salary_visible is true.
    salary_min: Mapped[int | None] = mapped_column(BigInteger)
    salary_max: Mapped[int | None] = mapped_column(BigInteger)
    salary_visible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    # Application period (inclusive, in the organisation's timezone). Null = no limit (older jobs).
    opens_on: Mapped[date | None] = mapped_column(Date)
    closes_on: Mapped[date | None] = mapped_column(Date)
    # Deprecated: scoring weights are organisation-wide (ti_settings "scoring_weights"); kept for old rows.
    weights: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Automatic AI-interview invitations, sent the day after closes_on (see services/auto_invite.py).
    auto_invite_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    auto_invite_top_n: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default="10")
    auto_invite_min_score: Mapped[float | None] = mapped_column(Float)
    # Set when a run (scheduled or "Send now") completed; the scheduler never sends again after that.
    auto_invite_ran_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # {trigger, template_id, template_name, invited_count, emailed_count, skipped: {...}, application_ids}
    auto_invite_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    auto_invite_error: Mapped[str | None] = mapped_column(Text)
    # Lease taken by the process running the batch (guards against double sends).
    auto_invite_claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    competencies: Mapped[list[JobCompetency]] = relationship(
        back_populates="job", cascade="all, delete-orphan", order_by="JobCompetency.position"
    )
    applications: Mapped[list[Application]] = relationship(back_populates="job")


class JobCompetency(db.Model):
    """Skills, certifications and competencies attached to a job, with weights."""

    __tablename__ = "ti_job_competencies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("ti_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    # required_skill | preferred_skill | certification
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    weight: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    rubric: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    position: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    job: Mapped[Job] = relationship(back_populates="competencies")


class Candidate(TimestampMixin, db.Model):
    __tablename__ = "ti_candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    phone: Mapped[str | None] = mapped_column(String(50))
    # True while the name is a placeholder waiting for CV extraction.
    name_pending: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # HR corrections are stored separately from AI output for auditability.
    corrections: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    applications: Mapped[list[Application]] = relationship(back_populates="candidate", cascade="all, delete-orphan")
    documents: Mapped[list[Document]] = relationship(
        back_populates="candidate", order_by="Document.created_at.desc()"
    )


class Application(TimestampMixin, db.Model):
    __tablename__ = "ti_applications"
    __table_args__ = (UniqueConstraint("candidate_id", "job_id", name="uq_application_candidate_job"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("ti_candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("ti_jobs.id"), nullable=False, index=True)
    stage: Mapped[str] = mapped_column(String(20), default="applied", nullable=False)
    match_score: Mapped[float | None] = mapped_column(Float)
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # How the application arrived: public_form | hr_upload | manual
    source: Mapped[str] = mapped_column(String(20), default="hr_upload", nullable=False, server_default="hr_upload")
    form_id: Mapped[int | None] = mapped_column(ForeignKey("ti_application_forms.id", ondelete="SET NULL"))
    # Applicant's answers to the job's custom form fields, with the field definitions at submit time.
    form_answers: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Final HR hiring decision after the AI interview: accepted | rejected (null = not decided). Cannot be changed.
    decision: Mapped[str | None] = mapped_column(String(20))
    decision_note: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id"))

    candidate: Mapped[Candidate] = relationship(back_populates="applications")
    job: Mapped[Job] = relationship(back_populates="applications")
    decided_by: Mapped[Actor | None] = relationship(foreign_keys=[decided_by_id])
    documents: Mapped[list[Document]] = relationship(
        back_populates="application", order_by="Document.created_at.desc()"
    )
    screenings: Mapped[list[ScreeningResult]] = relationship(
        back_populates="application", order_by="ScreeningResult.created_at.desc()"
    )
    stage_history: Mapped[list[StageHistory]] = relationship(
        back_populates="application", order_by="StageHistory.created_at"
    )
    reviews: Mapped[list[HRReview]] = relationship(back_populates="application", order_by="HRReview.created_at.desc()")


class ApplicationForm(TimestampMixin, db.Model):
    """Public application form for a job. Applicants open /apply/<slug> without an HR account."""

    __tablename__ = "ti_application_forms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("ti_jobs.id", ondelete="CASCADE"), nullable=False, unique=True)
    slug: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    intro: Mapped[str | None] = mapped_column(Text)
    # Custom fields (name/email/phone/CV are built in): [{id, label, type, required, options, help_text, ...}]
    fields: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft | published | closed
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    job: Mapped[Job] = relationship()


class Document(TimestampMixin, db.Model):
    __tablename__ = "ti_documents"
    __table_args__ = (UniqueConstraint("application_id", "sha256", name="uq_document_application_hash"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("ti_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("ti_candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(255), nullable=False)  # path relative to private storage dir
    status: Mapped[str] = mapped_column(String(20), default="queued", nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(50))
    error_message: Mapped[str | None] = mapped_column(Text)
    page_count: Mapped[int | None] = mapped_column(Integer)
    ocr_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pipeline_version: Mapped[str] = mapped_column(String(30), nullable=False, default="")
    steps: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    clean_text: Mapped[str | None] = mapped_column(Text)
    sections: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    extraction: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    methods: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    processing_ms: Mapped[int | None] = mapped_column(Integer)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id"))

    application: Mapped[Application] = relationship(back_populates="documents")
    candidate: Mapped[Candidate] = relationship(back_populates="documents")


class ScreeningResult(TimestampMixin, db.Model):
    __tablename__ = "ti_screening_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("ti_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("ti_documents.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    overall_score: Mapped[float | None] = mapped_column(Float)
    components: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    requirements: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    experience_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    flags: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    pipeline_version: Mapped[str] = mapped_column(String(30), nullable=False)
    methods: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    # Fingerprint of the job criteria used, to avoid re-running identical screenings.
    criteria_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    application: Mapped[Application] = relationship(back_populates="screenings")


class HRReview(TimestampMixin, db.Model):
    """HR notes, evidence validations and recommendations. Never overwrites AI output."""

    __tablename__ = "ti_hr_reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("ti_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    screening_result_id: Mapped[int | None] = mapped_column(ForeignKey("ti_screening_results.id", ondelete="SET NULL"))
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("ti_users.id"), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(String(30))
    evidence_validations: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    application: Mapped[Application] = relationship(back_populates="reviews")
    reviewer: Mapped[Actor] = relationship()


class StageHistory(TimestampMixin, db.Model):
    __tablename__ = "ti_candidate_stage_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("ti_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    from_stage: Mapped[str | None] = mapped_column(String(20))
    to_stage: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id"))
    note: Mapped[str | None] = mapped_column(Text)

    application: Mapped[Application] = relationship(back_populates="stage_history")
    changed_by: Mapped[Actor | None] = relationship()


class InterviewTemplate(TimestampMixin, db.Model):
    __tablename__ = "ti_interview_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("ti_jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    competencies: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    questions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    num_questions: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    follow_up_rules: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    invitation_expiry_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=72)
    # Interview language ("id" = Bahasa Indonesia, "en" = English).
    language: Mapped[str] = mapped_column(String(5), nullable=False, default="id", server_default="id")
    # Number of personalised questions generated from each candidate's CV (asked before template questions).
    cv_questions: Mapped[int] = mapped_column(Integer, nullable=False, default=2, server_default="2")
    # "template" = ask the configured questions in order; "conversational" = short LLM-led interview.
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="template", server_default="template")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    approved_by_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    job: Mapped[Job] = relationship()
    approved_by: Mapped[Actor | None] = relationship()


class InterviewSession(TimestampMixin, db.Model):
    __tablename__ = "ti_interview_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    application_id: Mapped[int] = mapped_column(ForeignKey("ti_applications.id", ondelete="CASCADE"), nullable=False, index=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("ti_interview_templates.id"), nullable=False)
    # Only the SHA-256 of the invitation token is stored; the raw token is shown once.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # Frozen copy of the template at invitation time, so later edits don't change a live interview.
    template_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    current_question_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    follow_ups_for_current: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    # Interview style frozen at invitation time ("template" | "conversational").
    mode: Mapped[str] = mapped_column(String(20), nullable=False, default="template", server_default="template")
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id"))

    application: Mapped[Application] = relationship()
    template: Mapped[InterviewTemplate] = relationship()
    messages: Mapped[list[InterviewMessage]] = relationship(
        back_populates="session", order_by="InterviewMessage.id", cascade="all, delete-orphan"
    )
    evaluations: Mapped[list[InterviewEvaluation]] = relationship(
        back_populates="session", order_by="InterviewEvaluation.id.desc()", cascade="all, delete-orphan"
    )


class InterviewMessage(TimestampMixin, db.Model):
    __tablename__ = "ti_interview_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("ti_interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # assistant | candidate
    content: Mapped[str] = mapped_column(Text, nullable=False)
    question_id: Mapped[str | None] = mapped_column(String(50))
    competency: Mapped[str | None] = mapped_column(String(255))
    is_follow_up: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Candidate answers: "voice" (browser speech-to-text) or "text" (typed).
    input_mode: Mapped[str | None] = mapped_column(String(10))
    # Conversational interviewer turns: "llm" (generated) or "fallback" (scripted text used instead).
    mode_used: Mapped[str | None] = mapped_column(String(10))

    session: Mapped[InterviewSession] = relationship(back_populates="messages")


class InterviewEvaluation(TimestampMixin, db.Model):
    __tablename__ = "ti_interview_evaluations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("ti_interview_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    method: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    overall_score: Mapped[float | None] = mapped_column(Float)
    overall_summary: Mapped[str | None] = mapped_column(Text)
    competencies: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    unanswered_areas: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    error_message: Mapped[str | None] = mapped_column(Text)
    reviewer_notes: Mapped[str | None] = mapped_column(Text)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    session: Mapped[InterviewSession] = relationship(back_populates="evaluations")
    reviewed_by: Mapped[Actor | None] = relationship()


class EmailLog(TimestampMixin, db.Model):
    """Outgoing email record. The body is stored with secrets (invitation tokens) redacted."""

    __tablename__ = "ti_email_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    to_email: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    body_redacted: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # sent | failed | not_configured
    error: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. interview_invitation
    session_id: Mapped[int | None] = mapped_column(ForeignKey("ti_interview_sessions.id", ondelete="SET NULL"), index=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id"))


class AppSetting(db.Model):
    """Organisation-wide settings editable by HR (e.g. ``scoring_weights``)."""

    __tablename__ = "ti_settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    updated_by: Mapped[Actor | None] = relationship()


class AuditLog(TimestampMixin, db.Model):
    __tablename__ = "ti_audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("ti_users.id"))
    actor_label: Mapped[str | None] = mapped_column(String(255))
    action: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(Integer)
    details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
