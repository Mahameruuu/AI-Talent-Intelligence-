"""Business dashboard metrics, computed from application data with aggregate SQL (no simulated numbers)."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import and_, exists, func, or_, select, true

from ..extensions import db
from ..models import Application, Candidate, InterviewEvaluation, InterviewSession, Job
from . import auto_invite, job_period

JOBS_TABLE_LIMIT = 6
ATTENTION_LIMIT = 5
CLOSING_SOON_DAYS = 3
MONTHS = 12
CLOSED_STAGES = ("hired", "rejected", "withdrawn")


def dashboard() -> dict:
    tz = ZoneInfo(current_app.config["TIMEZONE"])
    now = datetime.now(tz)
    today = now.date()
    scope = true()
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    interviewed = exists().where(InterviewSession.application_id == Application.id, InterviewSession.status == "completed")
    waiting = and_(interviewed, Application.decision.is_(None), Application.stage.notin_(CLOSED_STAGES))
    decided = or_(Application.decision.isnot(None), Application.stage.in_(("hired", "rejected")))

    def count_if(condition):
        return func.count(Application.id).filter(condition)

    # One grouped query feeds the KPIs and the jobs table.
    per_job = {row.job_id: row for row in db.session.execute(
        select(
            Application.job_id,
            func.count(Application.id).label("applicants"),
            count_if(Application.created_at >= week_ago).label("this_week"),
            func.avg(Application.match_score).label("avg_match_score"),
            count_if(interviewed).label("interviewed"),
            count_if(waiting).label("waiting"),
            count_if(Application.stage == "hired").label("hired"),
            count_if(decided).label("decided"),
            func.bool_or(Application.is_demo).label("is_demo"),
        ).where(scope).group_by(Application.job_id)
    )}

    jobs_q = select(Job.id, Job.title, Job.status, Job.opens_on, Job.opens_time, Job.closes_on, Job.closes_time,
                    Job.auto_invite_enabled, Job.auto_invite_ran_at, Job.auto_invite_timing, Job.created_at, Job.is_demo)
    jobs = db.session.execute(jobs_q).all()

    def total(field: str) -> int:
        return sum(getattr(row, field) for row in per_job.values())

    applicants, hired, decided_n = total("applicants"), total("hired"), total("decided")
    open_jobs = [j for j in jobs if j.status == "open"]

    # Jobs table: open first, then drafts, then closed; soonest deadline first.
    status_rank = {"open": 0, "draft": 1, "closed": 2}
    far = datetime.max.replace(tzinfo=tz)
    ordered = sorted(jobs, key=lambda j: (status_rank.get(j.status, 3), j.closes_on is None,
                                          job_period.deadline(j) or far, -j.created_at.timestamp()))
    jobs_table = []
    for j in ordered[:JOBS_TABLE_LIMIT]:
        agg = per_job.get(j.id)
        invite_at = auto_invite.send_at(j) \
            if j.auto_invite_enabled and j.auto_invite_ran_at is None and j.closes_on and j.status != "draft" else None
        jobs_table.append({
            "job_id": j.id, "title": j.title, "status": j.status,
            "closes_on": j.closes_on.isoformat() if j.closes_on else None,
            "closes_time": job_period.hhmm(j.closes_time),
            "closes_at": job_period.iso(job_period.closes_at(j)),
            "auto_invite_on": invite_at.date().isoformat() if invite_at else None,
            "auto_invite_at": job_period.iso(invite_at),
            "applicants": agg.applicants if agg else 0,
            "avg_match_score": round(float(agg.avg_match_score), 1) if agg and agg.avg_match_score is not None else None,
            "interviewed": agg.interviewed if agg else 0,
            "hired": agg.hired if agg else 0,
        })

    return {
        "has_data": bool(jobs or applicants),
        "has_demo_data": any(j.is_demo for j in jobs) or any(r.is_demo for r in per_job.values()),
        "kpis": {
            "open_jobs": len(open_jobs),
            "total_jobs": len(jobs),
            "applicants": applicants,
            "applicants_this_week": total("this_week"),
            "interviews_completed": total("interviewed"),
            "waiting_for_decision": total("waiting"),
            "hired": hired,
            "decided": decided_n,
            "hire_rate": round(hired / decided_n * 100, 1) if decided_n else None,
        },
        "jobs": jobs_table,
        "attention": _attention(scope, waiting, open_jobs, per_job, now),
        "monthly": _monthly(scope, tz, today),
    }


def _attention(scope, waiting, open_jobs, per_job, now: datetime) -> list[dict]:
    # Open jobs whose period hasn't closed yet (to the minute) and whose closing day is within 3 days.
    today = now.date()
    closing = sorted((j for j in open_jobs if j.closes_on and not job_period.has_closed(j, now)
                      and j.closes_on <= today + timedelta(days=CLOSING_SOON_DAYS)),
                     key=job_period.deadline)
    # Keep room for up to two deadline reminders; decisions fill the rest.
    decision_limit = ATTENTION_LIMIT - min(len(closing), 2)

    ranked = (
        select(InterviewSession.id, InterviewSession.application_id, InterviewSession.completed_at,
               func.row_number().over(partition_by=InterviewSession.application_id,
                                      order_by=(InterviewSession.completed_at.desc().nullslast(),
                                                InterviewSession.id.desc())).label("rank"))
        .where(InterviewSession.status == "completed")
        .subquery()
    )
    latest_session = select(ranked.c.id, ranked.c.application_id, ranked.c.completed_at).where(ranked.c.rank == 1).subquery()
    score = (select(InterviewEvaluation.overall_score)
             .where(InterviewEvaluation.session_id == latest_session.c.id)
             .order_by(InterviewEvaluation.created_at.desc(), InterviewEvaluation.id.desc())
             .limit(1).scalar_subquery())
    rows = db.session.execute(
        select(latest_session.c.id.label("session_id"), latest_session.c.completed_at, Application.id.label("application_id"),
               Candidate.full_name, Candidate.corrections, Job.title.label("job_title"), score.label("interview_score"))
        .join(Application, Application.id == latest_session.c.application_id)
        .join(Candidate, Candidate.id == Application.candidate_id)
        .join(Job, Job.id == Application.job_id)
        .where(scope, waiting)
        .order_by(latest_session.c.completed_at.asc().nullslast(), latest_session.c.id)
        .limit(decision_limit)
    ).all()

    items: list[dict] = [{
        "kind": "decision",
        "session_id": r.session_id,
        "application_id": r.application_id,
        "candidate_name": (r.corrections or {}).get("full_name") or r.full_name,
        "job_title": r.job_title,
        "interview_score": r.interview_score,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
    } for r in rows]
    for j in closing[:ATTENTION_LIMIT - len(items)]:
        agg = per_job.get(j.id)
        items.append({"kind": "job_closing", "job_id": j.id, "job_title": j.title, "closes_on": j.closes_on.isoformat(),
                      "closes_time": job_period.hhmm(j.closes_time),
                      "closes_at": job_period.iso(job_period.closes_at(j)),
                      "days_left": job_period.days_left(j, now), "applicants": agg.applicants if agg else 0})
    return items


def _month_starts(today: date) -> list[date]:
    first = today.replace(day=1)
    months = []
    for _ in range(MONTHS):
        months.append(first)
        first = (first - timedelta(days=1)).replace(day=1)
    return months[::-1]


def _monthly(scope, tz: ZoneInfo, today: date) -> list[dict]:
    """Last 12 calendar months (organisation timezone), oldest first; months without activity are 0."""
    months = _month_starts(today)
    since = datetime.combine(months[0], time.min, tzinfo=tz)
    zone = str(tz)

    def month_of(column):
        # timestamptz -> local wall time -> first day of that month.
        return func.date(func.date_trunc("month", func.timezone(zone, column)))

    def grouped(month_expr, query) -> dict[date, int]:
        return {m: n for m, n in db.session.execute(query.add_columns(month_expr, func.count()).group_by(month_expr)).all()}

    applicants = grouped(month_of(Application.created_at),
                         select().select_from(Application).where(scope, Application.created_at >= since))
    interviews = grouped(month_of(InterviewSession.completed_at),
                         select().select_from(InterviewSession)
                         .join(Application, Application.id == InterviewSession.application_id)
                         .where(scope, InterviewSession.status == "completed", InterviewSession.completed_at >= since))
    hired = grouped(month_of(Application.decided_at),
                    select().select_from(Application)
                    .where(scope, Application.decision == "accepted", Application.decided_at >= since))
    # Jobs open on `opens_on` when set, else when created; drafts never opened. Future opening dates don't count yet.
    opened_day = func.coalesce(Job.opens_on, func.date(func.timezone(zone, Job.created_at)))
    opened_month = func.date(func.date_trunc("month", opened_day))
    jobs_q = (select().select_from(Job)
              .where(Job.status != "draft", opened_day >= months[0], opened_day <= today))
    jobs_opened = grouped(opened_month, jobs_q)

    return [{"month": m.strftime("%Y-%m"), "applicants": applicants.get(m, 0), "jobs_opened": jobs_opened.get(m, 0),
             "interviews_completed": interviews.get(m, 0), "hired": hired.get(m, 0)} for m in months]
