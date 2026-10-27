from __future__ import annotations

import re
from datetime import date, time
from types import SimpleNamespace
from typing import Literal

from flask import request
from flask_restx import Namespace, Resource
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, func, or_

from ..extensions import db
from ..models import Application, InterviewTemplate, Job, JobCompetency
from ..security import current_actor, hr_endpoint
from ..services import audit, auto_invite, deletion, job_period, serializers
from ..errors import bad_request, conflict, not_found
from . import schemas as s
from .common import float_arg, page_parser, paginate, pagination_args, parse_body

ns = Namespace("Jobs", description="Job openings and their screening criteria", path="/", decorators=[hr_endpoint])

EducationLevel = Literal["none", "high_school", "diploma", "bachelor", "master", "doctorate"]
EmploymentType = Literal["full_time", "part_time", "contract", "internship", "freelance"]
InviteTiming = Literal["next_morning", "on_close"]
_HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$")


def _clean_list(values: list[str]) -> list[str]:
    out, seen = [], set()
    for v in values:
        v = v.strip()
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v[:120])
    return out


class WeightsIn(BaseModel):
    required_skills: float | None = Field(default=None, ge=0, le=100)
    preferred_skills: float | None = Field(default=None, ge=0, le=100)
    experience: float | None = Field(default=None, ge=0, le=100)
    education: float | None = Field(default=None, ge=0, le=100)
    certifications: float | None = Field(default=None, ge=0, le=100)
    semantic: float | None = Field(default=None, ge=0, le=100)


class AutoInviteIn(BaseModel):
    enabled: bool | None = None
    top_n: int | None = Field(default=None, ge=1, le=100)
    min_score: float | None = Field(default=None, ge=0, le=100)
    # next_morning: AUTO_INVITE_HOUR (08:00 WIB) the day after closes_on; on_close: right after applications close.
    timing: InviteTiming | None = None


class JobIn(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    department: str | None = Field(default=None, max_length=255)
    location: str | None = Field(default=None, max_length=255)
    description: str = Field(min_length=10, max_length=20000)
    required_skills: list[str] = Field(default_factory=list, max_length=40)
    preferred_skills: list[str] = Field(default_factory=list, max_length=40)
    min_experience_years: float | None = Field(default=None, ge=0, le=50)
    employment_type: EmploymentType = "full_time"
    # Monthly salary range in IDR; optional. salary_visible controls whether applicants see it.
    salary_min: int | None = Field(default=None, ge=0, le=10_000_000_000)
    salary_max: int | None = Field(default=None, ge=0, le=10_000_000_000)
    salary_visible: bool = False
    # Application period (WIB). Opens at opens_on opens_time (00:00 when null); closes at closes_on closes_time
    # (end of that day when null). Times are "HH:MM".
    opens_on: date | None = None
    closes_on: date | None = None
    opens_time: time | None = None
    closes_time: time | None = None
    education_level: EducationLevel | None = None
    education_field: str | None = Field(default=None, max_length=255)
    required_certifications: list[str] = Field(default_factory=list, max_length=20)
    status: Literal["draft", "open", "closed"] = "open"
    # Ignored: scoring weights are organisation-wide (GET/PUT /settings/scoring-weights).
    weights: WeightsIn | None = None
    # Automatic AI-interview invitations after the application period closes (all keys optional).
    auto_invite: AutoInviteIn | None = None

    @field_validator("opens_time", "closes_time", mode="before")
    @classmethod
    def _hhmm(cls, value):
        if value is None or value == "":
            return None
        if not isinstance(value, str) or not _HHMM.match(value):
            raise ValueError("Use the 24-hour format HH:MM.")
        return value

    @field_validator("opens_time", "closes_time")
    @classmethod
    def _minutes(cls, value: time | None) -> time | None:
        return value.replace(second=0, microsecond=0) if value is not None else None

    @field_validator("required_skills", "preferred_skills", "required_certifications")
    @classmethod
    def _clean(cls, value: list[str] | None) -> list[str] | None:
        return _clean_list(value) if value is not None else value


class JobPatch(JobIn):
    employment_type: EmploymentType | None = None
    salary_visible: bool | None = None
    title: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = Field(default=None, min_length=10, max_length=20000)
    required_skills: list[str] | None = None
    preferred_skills: list[str] | None = None
    required_certifications: list[str] | None = None
    status: Literal["draft", "open", "closed"] | None = None


def _check_salary(job: Job, data: dict) -> None:
    low = data.get("salary_min", job.salary_min)
    high = data.get("salary_max", job.salary_max)
    if low is not None and high is not None and high < low:
        raise bad_request("The maximum salary can't be lower than the minimum salary.",
                          {"fields": {"salary_max": "Must be greater than or equal to the minimum."}})


def _check_period(job: Job, data: dict) -> None:
    """The closing moment must come after the opening moment (400 with field details)."""
    period = SimpleNamespace(**{k: data[k] if k in data else getattr(job, k)
                                for k in ("opens_on", "opens_time", "closes_on", "closes_time")})
    if period.opens_on is None or period.closes_on is None:
        return
    if period.closes_on < period.opens_on:
        raise bad_request("The deadline (closes_on) can't be before the opening date (opens_on).",
                          {"fields": {"closes_on": "Must be on or after the opening date."}})
    if job_period.closes_at(period) <= job_period.opens_at(period):
        raise bad_request("Applications must close after they open (closes_time is not after opens_time).",
                          {"fields": {"closes_time": "Must be later than the opening time."}})


def _apply(job: Job, data: dict) -> None:
    _check_period(job, data)
    _check_salary(job, data)
    for key in ("title", "department", "location", "description", "min_experience_years", "education_level",
                "education_field", "status", "opens_on", "closes_on", "opens_time", "closes_time", "employment_type",
                "salary_min", "salary_max", "salary_visible"):
        if key in data:
            if data[key] is None and key in ("employment_type", "salary_visible", "status"):
                continue  # non-nullable: an explicit null means "leave unchanged"
            setattr(job, key, data[key])
    auto = data.get("auto_invite")
    if auto:
        if auto.get("enabled") is not None:
            job.auto_invite_enabled = auto["enabled"]
        if auto.get("top_n") is not None:
            job.auto_invite_top_n = auto["top_n"]
        if "min_score" in auto:
            job.auto_invite_min_score = auto["min_score"]
        if auto.get("timing") is not None:
            job.auto_invite_timing = auto["timing"]
    kinds = {"required_skills": "required_skill", "preferred_skills": "preferred_skill",
             "required_certifications": "certification"}
    for key, kind in kinds.items():
        if data.get(key) is None:
            continue
        for comp in [c for c in job.competencies if c.kind == kind]:
            job.competencies.remove(comp)
        for i, name in enumerate(data[key]):
            job.competencies.append(JobCompetency(kind=kind, name=name, position=i))


def _count(job_id: int) -> int:
    return Application.query.filter_by(job_id=job_id).count()


list_parser = page_parser()
list_parser.add_argument("status", location="args", choices=("draft", "open", "closed"))
list_parser.add_argument("q", location="args", help="Search title, department or location")


@ns.route("/jobs")
class Jobs(Resource):
    @ns.expect(list_parser)
    @ns.response(200, "Jobs", s.JobPage)
    def get(self):
        """List jobs with candidate counts."""
        page, size = pagination_args()
        q = Job.query
        if request.args.get("status"):
            q = q.filter(Job.status == request.args["status"])
        if request.args.get("q"):
            term = f"%{request.args['q'].strip()}%"
            q = q.filter(or_(Job.title.ilike(term), Job.department.ilike(term), Job.location.ilike(term)))
        q = q.order_by(Job.status == "closed", Job.created_at.desc())
        return paginate(q, lambda j: serializers.job(j, _count(j.id)), page, size)

    @ns.expect(s.JobInput)
    @ns.response(201, "Created", s.Job)
    @ns.response(400, "Validation error", s.Error)
    def post(self):
        """Create a job with its requirements. Scoring weights are organisation-wide (Settings → Scoring weights)."""
        body = parse_body(JobIn).model_dump()
        job = Job(weights={}, created_by_id=current_actor().id, auto_invite_enabled=True, auto_invite_top_n=10,
                  auto_invite_timing="next_morning")
        _apply(job, body)
        db.session.add(job)
        db.session.flush()
        audit.record("job.created", "job", job.id, {"title": job.title})
        db.session.commit()
        return serializers.job(job, 0), 201


@ns.route("/jobs/<int:job_id>")
class JobItem(Resource):
    @ns.response(200, "Job", s.Job)
    @ns.response(404, "Not found", s.Error)
    def get(self, job_id: int):
        """Get a job."""
        job = db.session.get(Job, job_id)
        if job is None:
            raise not_found("Job")
        return serializers.job(job, _count(job.id))

    @ns.expect(s.JobInput)
    @ns.response(200, "Updated", s.Job)
    def patch(self, job_id: int):
        """Update a job (partial). Set `status` to `closed` to close it. Existing screenings are kept;
        re-run screening to apply new criteria."""
        job = db.session.get(Job, job_id)
        if job is None:
            raise not_found("Job")
        body = parse_body(JobPatch).model_dump(exclude_unset=True)
        _apply(job, body)
        audit.record("job.updated", "job", job.id, {"fields": sorted(body.keys())})
        db.session.commit()
        return serializers.job(job, _count(job.id))

    @ns.doc(params={"force": "Also delete this job's applications (CVs, screenings, interviews). "
                             "Candidate profiles are kept."})
    @ns.response(204, "Deleted")
    @ns.response(409, "Job has applications (close it instead, or pass force=true)", s.Error)
    def delete(self, job_id: int):
        """Delete a job together with its application form and interview templates. Jobs that already have
        applications are protected: close them instead, or pass `force=true`."""
        job = db.session.get(Job, job_id)
        if job is None:
            raise not_found("Job")
        applications = Application.query.filter_by(job_id=job.id).all()
        force = request.args.get("force", "").lower() in ("1", "true", "yes")
        if applications and not force:
            raise conflict(f"This job has {len(applications)} application(s). Close the job to stop new applications "
                           "while keeping their history, or delete it permanently with force=true.",
                           code="job_has_applications", details={"applications": len(applications)})
        title = job.title
        # Shared with candidate/application deletion: documents, screenings, reviews, stage history,
        # interviews and their email logs go with the applications.
        purge = deletion.purge_applications(a.id for a in applications)
        db.session.execute(delete(InterviewTemplate).where(InterviewTemplate.job_id == job_id))
        db.session.expire_all()
        db.session.delete(db.session.get(Job, job_id))
        audit.record("job.deleted", "job", job_id, {"title": title, "applications_deleted": len(applications)})
        db.session.commit()
        deletion.remove_files(purge.storage_keys)
        return "", 204


@ns.route("/jobs/<int:job_id>/auto-invite/run")
class AutoInviteRun(Resource):
    @ns.response(200, "Invitations sent; the updated job", s.Job)
    @ns.response(409, "No approved interview template (no_approved_template), or a run is in progress", s.Error)
    def post(self, job_id: int):
        """Send now: run the auto-invite selection immediately, regardless of the date (also after a previous run;
        only applicants without an interview invitation are invited). Top N screened applicants by match score,
        excluding failed must-have screening questions and scores below the minimum, are shortlisted and emailed
        an AI interview link with the job's approved template."""
        job = db.session.get(Job, job_id)
        if job is None:
            raise not_found("Job")
        if auto_invite.approved_template(job.id) is None:
            raise conflict("Approve an interview template for this job before sending invitations.",
                           code="no_approved_template")
        if not auto_invite.claim(job.id, scheduled=False):
            raise conflict("Invitations for this job are being sent right now. Try again in a moment.",
                           code="auto_invite_running")
        try:
            auto_invite.run(db.session.get(Job, job_id), trigger="manual", created_by_id=current_actor().id)
        except auto_invite.NoApprovedTemplate as exc:
            auto_invite.release(job_id)
            raise conflict("Approve an interview template for this job before sending invitations.",
                           code="no_approved_template") from exc
        except Exception as exc:
            auto_invite.release(job_id, error=f"{type(exc).__name__}: {exc}")
            raise
        job = db.session.get(Job, job_id)
        return serializers.job(job, _count(job.id))


app_parser = page_parser()
app_parser.add_argument("stage", location="args")
app_parser.add_argument("min_score", type=float, location="args")
app_parser.add_argument("sort", location="args", choices=("score", "created"), default="score")


@ns.route("/jobs/<int:job_id>/applications")
class JobApplications(Resource):
    @ns.expect(app_parser)
    @ns.response(200, "Applications for this job", s.ApplicationPage)
    def get(self, job_id: int):
        """List applicants for a job, sorted by match score by default."""
        if db.session.get(Job, job_id) is None:
            raise not_found("Job")
        page, size = pagination_args()
        q = Application.query.filter(Application.job_id == job_id)
        if request.args.get("stage"):
            q = q.filter(Application.stage == request.args["stage"])
        min_score = float_arg("min_score")
        if min_score is not None:
            q = q.filter(Application.match_score >= min_score)
        if request.args.get("sort") == "created":
            q = q.order_by(Application.created_at.desc())
        else:
            q = q.order_by(func.coalesce(Application.match_score, -1).desc(), Application.id)
        return paginate(q, serializers.application, page, size)
