"""Automatic deletion of applicant data after a job closes (data retention, UU PDP storage limitation).

Setting ``data_retention`` in ``ti_settings`` (edited by HR in Settings):
``{"enabled": false, "months_after_close": 12, "keep_hired": true}``.

An application is *eligible* when
- its job's close date is more than N months ago. The close date is ``closes_on``; for a job with status
  ``closed`` it is the earlier of ``closes_on`` and the job's last update (when it was closed), or the last
  update alone when there is no ``closes_on``. Open jobs without a deadline never expire;
- it is not hired (when ``keep_hired``);
- it has no AI interview in progress.

Eligible applications are deleted with the same full cascade as a manual delete (``services/deletion.py``),
and a candidate is deleted once no applications remain. Nothing is ever deleted while ``enabled`` is false.

``tick(now)`` is called by the background scheduler (``app/scheduler.py``) and runs once per day at
``RETENTION_HOUR`` (local time); the day is claimed atomically in the database so several processes never run
it twice. HR can also "Run now" (``POST /settings/data-retention/run``).
"""

from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import and_, case, exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert

from ..errors import ApiError, bad_request
from ..extensions import db
from ..models import AppSetting, Application, Candidate, InterviewSession, Job, Actor
from . import audit, deletion

log = logging.getLogger(__name__)

SETTING_KEY = "data_retention"
STATE_KEY = "data_retention_state"  # {"last_run_on": "YYYY-MM-DD"}: the scheduler's daily claim
SCHEDULER_ACTOR = "data-retention-scheduler"
DEFAULTS = {"enabled": False, "months_after_close": 12, "keep_hired": True}
MIN_MONTHS, MAX_MONTHS = 1, 36
BATCH_SIZE = 200


def _tz() -> ZoneInfo:
    return ZoneInfo(current_app.config["TIMEZONE"])


def now_local() -> datetime:
    return datetime.now(_tz())


# ---------------------------------------------------------------- setting

def get_setting() -> dict:
    row = db.session.get(AppSetting, SETTING_KEY)
    value = dict(DEFAULTS)
    if row is not None:
        value.update({k: row.value[k] for k in DEFAULTS if k in row.value})
    return value


def validate(raw: object) -> dict:
    if not isinstance(raw, dict):
        raise bad_request("Request body must be a JSON object.")
    unknown = sorted(set(raw) - set(DEFAULTS))
    if unknown:
        raise bad_request("Unknown fields.", {"unknown": unknown})
    value = get_setting()
    errors: dict[str, str] = {}
    for key in ("enabled", "keep_hired"):
        if key in raw:
            if not isinstance(raw[key], bool):
                errors[key] = "Must be true or false."
            else:
                value[key] = raw[key]
    if "months_after_close" in raw:
        months = raw["months_after_close"]
        if isinstance(months, bool) or not isinstance(months, int) or not MIN_MONTHS <= months <= MAX_MONTHS:
            errors["months_after_close"] = f"Must be a whole number from {MIN_MONTHS} to {MAX_MONTHS}."
        else:
            value["months_after_close"] = months
    if errors:
        raise bad_request("Invalid data retention settings.", {"fields": errors})
    return value


def save(raw: object, actor: Actor) -> dict:
    value = validate(raw)
    before = get_setting()
    row = db.session.get(AppSetting, SETTING_KEY)
    if row is None:
        db.session.add(AppSetting(key=SETTING_KEY, value=value, updated_by_id=actor.id))
    else:
        row.value = value
        row.updated_by_id = actor.id
    audit.record("settings.data_retention_updated", "setting", None, {"before": before, "after": value})
    db.session.commit()
    return describe()


# ---------------------------------------------------------------- eligibility

def subtract_months(day: date, months: int) -> date:
    """Same day N months earlier (clamped to the month's last day, e.g. 31 Mar - 1 month = 28/29 Feb)."""
    total = day.year * 12 + day.month - 1 - months
    year, month = divmod(total, 12)
    month += 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def cutoff_date(months: int, today: date | None = None) -> date:
    """Jobs that closed *before* this date are past the retention period."""
    return subtract_months(today or now_local().date(), months)


def _close_date_expr():
    """SQL expression for a job's close date (NULL = never closes)."""
    tz = current_app.config["TIMEZONE"]
    closed_on = func.date(func.timezone(tz, Job.updated_at))
    return case(
        (and_(Job.status == "closed", Job.closes_on.isnot(None)), func.least(Job.closes_on, closed_on)),
        (Job.status == "closed", closed_on),
        else_=Job.closes_on,
    )


def eligible_applications_query(setting: dict, *, today: date | None = None, now: datetime | None = None):
    """Select ``(Application.id, Application.candidate_id)`` rows past the retention period."""
    cutoff = cutoff_date(int(setting["months_after_close"]), today)
    now = now or datetime.now(timezone.utc)
    interview_in_progress = exists().where(InterviewSession.application_id == Application.id,
                                           InterviewSession.status == "in_progress",
                                           InterviewSession.expires_at > now)
    close_date = _close_date_expr()
    q = (select(Application.id, Application.candidate_id).join(Job, Application.job_id == Job.id)
         .where(close_date.isnot(None), close_date < cutoff, ~interview_in_progress))
    if setting.get("keep_hired", True):
        q = q.where(Application.stage != "hired")
    return q.order_by(Application.id)


def preview(setting: dict | None = None, *, today: date | None = None) -> dict:
    setting = setting or get_setting()
    rows = db.session.execute(eligible_applications_query(setting, today=today)).all()
    eligible_ids = {r.id for r in rows}
    candidate_ids = {r.candidate_id for r in rows}
    removed_candidates = 0
    if candidate_ids:
        # A candidate is deleted only when every one of their applications is eligible.
        remaining = set(db.session.scalars(
            select(Application.candidate_id).where(Application.candidate_id.in_(candidate_ids),
                                                   Application.id.notin_(eligible_ids)).distinct()))
        removed_candidates = len(candidate_ids - remaining)
    return {"eligible_applications": len(eligible_ids), "eligible_candidates": removed_candidates}


def next_run_at(setting: dict, now: datetime | None = None) -> str | None:
    if not setting["enabled"] or not current_app.config.get("RETENTION_SCHEDULER_ENABLED", True):
        return None
    now = (now or now_local()).astimezone(_tz())
    run_today = datetime.combine(now.date(), time(hour=current_app.config["RETENTION_HOUR"]), tzinfo=_tz())
    state = db.session.get(AppSetting, STATE_KEY)
    ran_today = state is not None and state.value.get("last_run_on") == now.date().isoformat()
    when = run_today if now < run_today and not ran_today else run_today + timedelta(days=1)
    return when.isoformat()


def describe() -> dict:
    setting = get_setting()
    row = db.session.get(AppSetting, SETTING_KEY)
    state = db.session.get(AppSetting, STATE_KEY)
    return {
        **setting,
        "is_default": row is None,
        "updated_at": row.updated_at.isoformat() if row else None,
        "updated_by": row.updated_by.full_name if row and row.updated_by else None,
        "last_run_at": (state.value.get("last_run_at") if state else None),
        "last_run_result": (state.value.get("last_result") if state else None),
        "preview": {**preview(setting), "next_run_at": next_run_at(setting)},
    }


# ---------------------------------------------------------------- run

def run(*, trigger: str, today: date | None = None) -> dict:
    """Delete everything past the retention period now. No-op (raises) when retention is disabled."""
    setting = get_setting()
    if not setting["enabled"]:
        raise ApiError(409, "retention_disabled", "Automatic deletion is turned off.")
    rows = db.session.execute(eligible_applications_query(setting, today=today)).all()
    app_ids = [r.id for r in rows]
    candidate_ids = sorted({r.candidate_id for r in rows})
    totals = {"applications": 0, "candidates": 0, "documents": 0, "interview_sessions": 0}
    for start in range(0, len(app_ids), BATCH_SIZE):
        purge = deletion.purge_applications(app_ids[start:start + BATCH_SIZE])
        for k, v in purge.counts().items():
            totals[k] += v
        db.session.commit()
        deletion.remove_files(purge.storage_keys)
    if candidate_ids:
        orphans = list(db.session.scalars(
            select(Candidate).where(Candidate.id.in_(candidate_ids),
                                    ~exists().where(Application.candidate_id == Candidate.id))))
        for candidate in orphans:
            purge = deletion.purge_candidate(candidate)  # also removes leftover email logs / stray files
            totals["documents"] += purge.documents
            totals["candidates"] += 1
            db.session.commit()
            deletion.remove_files(purge.storage_keys)
    result = {"trigger": trigger, "months_after_close": setting["months_after_close"],
              "keep_hired": setting["keep_hired"], **totals}
    audit.record("data_retention.run", "setting", None, result,
                 actor_label=SCHEDULER_ACTOR if trigger == "scheduled" else None)
    _store_state(last_run_at=datetime.now(timezone.utc).isoformat(), last_result=totals)
    db.session.commit()
    log.info("Data retention (%s): deleted %s applications, %s candidates", trigger, totals["applications"],
             totals["candidates"])
    return result


def _store_state(**values) -> None:
    row = db.session.get(AppSetting, STATE_KEY)
    if row is None:
        db.session.add(AppSetting(key=STATE_KEY, value=values))
    else:
        row.value = {**row.value, **values}


def claim_day(day: date) -> bool:
    """Atomically mark ``day`` as processed. True for exactly one caller per day (across processes)."""
    day_s = day.isoformat()
    stmt = (insert(AppSetting).values(key=STATE_KEY, value={"last_run_on": day_s}, updated_at=func.now())
            .on_conflict_do_update(
                index_elements=[AppSetting.key],
                set_={"value": AppSetting.value.op("||")(func.jsonb_build_object("last_run_on", day_s)),
                      "updated_at": func.now()},
                where=or_(AppSetting.value["last_run_on"].astext.is_(None),
                          AppSetting.value["last_run_on"].astext != day_s))
            .returning(AppSetting.key))
    claimed = db.session.execute(stmt).first() is not None
    db.session.commit()
    return claimed


def tick(now: datetime | None = None) -> str:
    """Run the daily retention if it is due. Never raises. Returns what happened (for logs/tests)."""
    try:
        now = (now or now_local()).astimezone(_tz())
        if now.hour < current_app.config["RETENTION_HOUR"]:
            return "not_due"
        # The day is claimed even when retention is off, so turning it on later in the day waits for the
        # next scheduled run instead of deleting data within minutes.
        if not claim_day(now.date()):
            return "already_ran"
        if not get_setting()["enabled"]:
            return "disabled"
        run(trigger="scheduled", today=now.date())
        return "ran"
    except Exception:
        log.exception("Data retention tick failed")
        db.session.rollback()
        return "error"
