"""Automatic AI-interview invitations, sent after a job's application period has closed.

Rules (editable per job): when the application period has closed — by default (timing ``next_morning``) at
``AUTO_INVITE_HOUR`` (default 08:00, organisation timezone, WIB) on the day after ``closes_on``, or with timing
``on_close`` right after the closing moment (``closes_on closes_time``, see ``job_period``) — the top N screened applicants by match score (optionally above a minimum score) are moved to
``shortlisted`` and invited with the job's approved interview template, using the same code path as the HR bulk
invite. Applicants who failed a must-have (knockout) screening question, who are not screened yet, or who already
have an interview session are skipped. A job is sent at most once automatically; HR can always invite manually
or press "Send now" (``POST /jobs/{id}/auto-invite/run``).

``tick(now)`` is called by the background scheduler (``app/scheduler.py``) and directly by the tests.
"""

from __future__ import annotations

import logging
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import and_, or_, update

from ..extensions import db
from ..models import Application, Document, InterviewSession, InterviewTemplate, Job, StageHistory
from . import audit, job_period

log = logging.getLogger(__name__)

SCHEDULER_ACTOR = "auto-invite-scheduler"
POOL_STAGES = ("applied", "screening", "shortlisted")
# If CVs are still being processed at send time, wait for them up to this long after send_at.
PROCESSING_GRACE = timedelta(hours=2)
# A claim older than this is considered abandoned (crashed process) and can be taken over.
CLAIM_TTL = timedelta(minutes=30)
AUTO_NOTE = "Shortlisted automatically after applications closed."
MANUAL_NOTE = "Shortlisted by auto-invite (Send now)."
TIMINGS = ("next_morning", "on_close")
SKIP_KEYS = ("knockout", "below_min_score", "not_screened", "already_invited", "beyond_top_n")


class NoApprovedTemplate(Exception):
    pass


def _tz() -> ZoneInfo:
    return ZoneInfo(current_app.config["TIMEZONE"])


def now_local() -> datetime:
    return datetime.now(_tz())


def send_at(job) -> datetime | None:
    """When the invitations are due (None without a deadline), in the organisation timezone:
    ``next_morning`` → closes_on + 1 day at AUTO_INVITE_HOUR; ``on_close`` → the moment applications close.
    Accepts a Job or a SQL row with closes_on/closes_time/auto_invite_timing."""
    if job.closes_on is None:
        return None
    if getattr(job, "auto_invite_timing", None) == "on_close":
        return job_period.deadline(job)
    return datetime.combine(job.closes_on + timedelta(days=1), time(hour=current_app.config["AUTO_INVITE_HOUR"]),
                            tzinfo=_tz())


def approved_template(job_id: int) -> InterviewTemplate | None:
    """The job's most recently approved/updated approved template."""
    return (InterviewTemplate.query.filter_by(job_id=job_id, status="approved")
            .order_by(InterviewTemplate.updated_at.desc(), InterviewTemplate.id.desc()).first())


def status(job: Job, template: InterviewTemplate | None = None, *, template_known: bool = False) -> str:
    if not job.auto_invite_enabled:
        return "disabled"
    if job.auto_invite_ran_at is not None:
        return "sent"
    if job.auto_invite_error:
        return "failed"
    if job.closes_on is None:
        return "no_deadline"
    if not template_known:
        template = approved_template(job.id)
    if template is None:
        return "waiting_template"
    return "scheduled"


def summary(job: Job) -> dict:
    """The ``auto_invite`` block of the Job response."""
    result = job.auto_invite_result or {}
    ran = job.auto_invite_ran_at is not None
    template = None if ran else approved_template(job.id)
    when = send_at(job)
    return {
        "enabled": bool(job.auto_invite_enabled),
        "top_n": job.auto_invite_top_n,
        "min_score": job.auto_invite_min_score,
        "timing": job.auto_invite_timing or "next_morning",
        "send_at": when.isoformat() if when else None,
        "status": status(job, template, template_known=True),
        "template_id": result.get("template_id") if ran else (template.id if template else None),
        "template_name": result.get("template_name") if ran else (template.name if template else None),
        "ran_at": job.auto_invite_ran_at.astimezone(_tz()).isoformat() if ran else None,
        "invited_count": result.get("invited_count") if result else None,
        "skipped": {k: int((result.get("skipped") or {}).get(k, 0)) for k in SKIP_KEYS} if result else None,
        "error": job.auto_invite_error,
    }


# ---------------------------------------------------------------- selection

def select(job: Job) -> tuple[list[Application], dict[str, int]]:
    """Pick the applications to invite, and count why the others were skipped."""
    from .serializers import knockout_failed

    # Applicants already in the interview stage are counted as already invited.
    pool = (Application.query.filter(Application.job_id == job.id, Application.stage.in_(POOL_STAGES + ("interview",)))
            .order_by(Application.id).all())
    invited = {row[0] for row in db.session.query(InterviewSession.application_id)
               .filter(InterviewSession.application_id.in_([a.id for a in pool])).distinct()} if pool else set()
    skipped = dict.fromkeys(SKIP_KEYS, 0)
    eligible: list[Application] = []
    for a in pool:
        latest = a.screenings[0] if a.screenings else None
        if a.id in invited or a.stage == "interview":
            skipped["already_invited"] += 1
        elif latest is None or latest.status != "completed" or a.match_score is None:
            skipped["not_screened"] += 1
        elif knockout_failed(latest):
            skipped["knockout"] += 1
        elif job.auto_invite_min_score is not None and a.match_score < job.auto_invite_min_score:
            skipped["below_min_score"] += 1
        else:
            eligible.append(a)
    eligible.sort(key=lambda a: (-a.match_score, a.created_at, a.id))
    top_n = job.auto_invite_top_n or 10
    selected = eligible[:top_n]
    skipped["beyond_top_n"] = len(eligible) - len(selected)
    return selected, skipped


def documents_pending(job: Job) -> int:
    """CVs of this job's candidate pool still queued or being processed."""
    return (Document.query.join(Application, Document.application_id == Application.id)
            .filter(Application.job_id == job.id, Application.stage.in_(POOL_STAGES),
                    Document.status.in_(("queued", "processing"))).count())


# ---------------------------------------------------------------- claim / run

def _set(job_id: int, **values) -> None:
    """Update auto-invite columns without touching ``updated_at`` (that tracks HR edits)."""
    db.session.execute(update(Job).where(Job.id == job_id).values(updated_at=Job.updated_at, **values)
                       .execution_options(synchronize_session=False))


def claim(job_id: int, *, scheduled: bool) -> bool:
    """Atomically take the job's auto-invite lease. Only one process/tick can hold it at a time; a scheduled
    claim also requires that the job hasn't been sent yet (so it is never sent twice automatically)."""
    now = datetime.now(timezone.utc)
    stmt = (update(Job).where(Job.id == job_id, or_(Job.auto_invite_claimed_at.is_(None),
                                                    Job.auto_invite_claimed_at < now - CLAIM_TTL))
            .values(auto_invite_claimed_at=now, updated_at=Job.updated_at)
            .execution_options(synchronize_session=False))
    if scheduled:
        stmt = stmt.where(Job.auto_invite_ran_at.is_(None), Job.auto_invite_enabled.is_(True),
                          Job.closes_on.isnot(None))
    result = db.session.execute(stmt)
    db.session.commit()
    return result.rowcount == 1


def release(job_id: int, error: str | None = None) -> None:
    db.session.rollback()
    values = {"auto_invite_claimed_at": None}
    if error is not None:
        values["auto_invite_error"] = error[:1000]
    _set(job_id, **values)
    db.session.commit()


def run(job: Job, *, trigger: str, created_by_id: int | None = None) -> dict:
    """Shortlist + invite the selected applications now. The caller must hold the claim.

    Raises NoApprovedTemplate when the job has no approved interview template.
    """
    from . import interviews

    template = approved_template(job.id)
    if template is None:
        raise NoApprovedTemplate()
    job_id, template_id, template_name = job.id, template.id, template.name
    selected, skipped = select(job)
    note = AUTO_NOTE if trigger == "auto" else MANUAL_NOTE
    results: list[dict] = []
    for app_id in [a.id for a in selected]:
        a = db.session.get(Application, app_id)
        try:
            if a.stage in ("applied", "screening"):
                db.session.add(StageHistory(application_id=a.id, from_stage=a.stage, to_stage="shortlisted",
                                            changed_by_id=created_by_id, note=note))
                a.stage = "shortlisted"
                db.session.flush()
            results.append(interviews.invite_application(a, template, send_email=True,
                                                         created_by_id=created_by_id))
        except Exception as exc:  # one candidate must never abort the batch
            log.exception("Auto-invite failed for application %s", app_id)
            db.session.rollback()
            results.append({"application_id": app_id, "status": "failed", "reason": type(exc).__name__})
    invited = [r for r in results if r["status"] == "invited"]
    outcome = {
        "trigger": trigger,
        "template_id": template_id,
        "template_name": template_name,
        "invited_count": len(invited),
        "emailed_count": sum(1 for r in invited if r.get("email_status") == "sent"),
        "email_failed_count": sum(1 for r in invited if r.get("email_status") not in ("sent", "not_requested")),
        "failed_count": sum(1 for r in results if r["status"] == "failed"),
        "skipped": skipped,
        "application_ids": [r["application_id"] for r in invited],
    }
    ran_at = datetime.now(timezone.utc)
    _set(job_id, auto_invite_ran_at=ran_at, auto_invite_result=outcome, auto_invite_error=None,
         auto_invite_claimed_at=None)
    audit.record("interviews.auto_invite_run", "job", job_id,
                 {k: v for k, v in outcome.items() if k != "template_name"},
                 actor_label=SCHEDULER_ACTOR if trigger == "auto" else None)
    db.session.commit()
    db.session.expire_all()
    return outcome


# ---------------------------------------------------------------- scheduler tick

def process_due(job: Job, now: datetime) -> str:
    """Send one job's invitations if they are due. Returns what happened (for logs/tests)."""
    when = send_at(job)
    if when is None or now < when:
        return "not_due"
    if approved_template(job.id) is None:
        return "waiting_template"
    if documents_pending(job) and now < when + PROCESSING_GRACE:
        return "waiting_documents"
    job_id = job.id
    if not claim(job_id, scheduled=True):
        return "claimed_elsewhere"
    try:
        job = db.session.get(Job, job_id)
        run(job, trigger="auto")
    except NoApprovedTemplate:  # template un-approved in the meantime: keep waiting
        release(job_id)
        return "waiting_template"
    except Exception as exc:
        log.exception("Auto-invite run failed for job %s", job_id)
        release(job_id, error=f"{type(exc).__name__}: {exc}")
        return "failed"
    return "sent"


def tick(now: datetime | None = None) -> dict[int, str]:
    """Process every job whose auto-invite is due. Never raises.

    Cheap when nothing is due: one indexed query returns only enabled, unsent jobs whose closing day has been
    reached (``on_close``) or passed (``next_morning``); usually none."""
    now = now or now_local()
    today = now.astimezone(_tz()).date()
    outcomes: dict[int, str] = {}
    try:
        jobs = (Job.query.filter(Job.auto_invite_enabled.is_(True), Job.closes_on.isnot(None),
                                 Job.auto_invite_ran_at.is_(None),
                                 or_(Job.closes_on < today,
                                     and_(Job.auto_invite_timing == "on_close", Job.closes_on == today)))
                .order_by(Job.closes_on, Job.id).all())
        job_ids = [j.id for j in jobs]
    except Exception:
        log.exception("Auto-invite tick could not list jobs")
        db.session.rollback()
        return outcomes
    for job_id in job_ids:
        try:
            job = db.session.get(Job, job_id)
            if job is not None:
                outcomes[job_id] = process_due(job, now)
                if outcomes[job_id] in ("sent", "failed"):
                    log.info("Auto-invite for job %s: %s", job_id, outcomes[job_id])
        except Exception:
            log.exception("Auto-invite tick failed for job %s", job_id)
            db.session.rollback()
            outcomes[job_id] = "error"
    return outcomes
