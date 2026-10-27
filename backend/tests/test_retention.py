"""Data retention: automatic deletion of applicant data N months after the job closes."""

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from flask import current_app
from sqlalchemy import func, select, update

from app.extensions import db
from app.models import (AppSetting, Application, AuditLog, Candidate, Document, EmailLog, InterviewSession, Job,
                        StageHistory)
from app.services import retention
from tests.conftest import JOB_PAYLOAD, upload
from tests.test_interviews import invite, setup_interview

API = "/api/v1/talent"
WIB = ZoneInfo("Asia/Jakarta")
TODAY = date(2026, 10, 27)


def _set_job(job_id, *, status=None, closes_on=None, updated_at=None):
    values = {"updated_at": updated_at or Job.updated_at}
    if status is not None:
        values["status"] = status
    values["closes_on"] = closes_on
    db.session.execute(update(Job).where(Job.id == job_id).values(**values))
    db.session.commit()


def _enable(client, hr, **extra):
    res = client.put(f"{API}/settings/data-retention", json={"enabled": True, **extra}, headers=hr)
    assert res.status_code == 200, res.json
    return res.json


def _eligible(setting=None, today=TODAY):
    setting = {**retention.DEFAULTS, **(setting or {})}
    return {r.id for r in db.session.execute(retention.eligible_applications_query(setting, today=today))}


def _new_job(client, hr, title):
    res = client.post(f"{API}/jobs", json={**JOB_PAYLOAD, "title": title}, headers=hr)
    assert res.status_code == 201, res.json
    return res.json["id"]


def test_subtract_months_clamps_month_end():
    assert retention.subtract_months(date(2026, 10, 27), 12) == date(2025, 10, 27)
    assert retention.subtract_months(date(2026, 3, 31), 1) == date(2026, 2, 28)
    assert retention.subtract_months(date(2026, 1, 15), 36) == date(2023, 1, 15)


def test_eligibility_rules(app, client, hr, job):
    a_open = upload(client, hr, job["id"], "rina").json["application"]["id"]
    job2 = _new_job(client, hr, "Closed long ago")
    a_old = upload(client, hr, job2, "budi").json["application"]["id"]
    a_hired = upload(client, hr, job2, "dewi").json["application"]["id"]
    job3 = _new_job(client, hr, "Closed without deadline")
    a_closed = upload(client, hr, job3, "andi").json["application"]["id"]
    with app.app_context():
        db.session.get(Application, a_hired).stage = "hired"
        db.session.commit()
        # Open job with a deadline exactly 12 months ago: not *more than* 12 months -> kept.
        _set_job(job["id"], closes_on=date(2025, 10, 27))
        _set_job(job2, status="closed", closes_on=date(2025, 10, 26))
        _set_job(job3, status="closed", closes_on=None, updated_at=datetime(2025, 1, 1, tzinfo=timezone.utc))
        assert _eligible() == {a_old, a_closed}
        assert _eligible({"keep_hired": False}) == {a_old, a_hired, a_closed}
        # One day later the open job's deadline is past the boundary too.
        assert a_open in _eligible(today=TODAY + timedelta(days=1))
        assert _eligible({"months_after_close": 24}) == set()
        # Open jobs without a deadline never expire; a closed job closed recently is kept.
        _set_job(job["id"], closes_on=None)
        _set_job(job3, status="closed", closes_on=None, updated_at=datetime(2026, 9, 1, tzinfo=timezone.utc))
        assert _eligible() == {a_old}
        # Closed early: the date it was closed counts, not the (future) deadline.
        _set_job(job3, status="closed", closes_on=date(2027, 1, 1), updated_at=datetime(2025, 1, 1, tzinfo=timezone.utc))
        assert _eligible() == {a_old, a_closed}


def test_interview_in_progress_is_skipped(app, client, hr, job):
    app_id, tid = setup_interview(client, hr, job)
    _, headers, _ = invite(client, hr, app_id, tid)
    assert client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers).status_code == 200
    with app.app_context():
        _set_job(job["id"], status="closed", closes_on=date(2024, 1, 1))
        assert _eligible() == set()
        # An expired session doesn't block deletion.
        db.session.execute(update(InterviewSession).values(expires_at=datetime.now(timezone.utc) - timedelta(hours=1)))
        db.session.commit()
        assert _eligible() == {app_id}


def test_settings_endpoints(client, hr):
    res = client.get(f"{API}/settings/data-retention", headers=hr)
    assert res.status_code == 200
    body = res.json
    assert body["enabled"] is False and body["months_after_close"] == 12 and body["keep_hired"] is True
    assert body["is_default"] is True
    assert body["preview"] == {"eligible_applications": 0, "eligible_candidates": 0, "next_run_at": None}

    # Never delete while disabled.
    res = client.post(f"{API}/settings/data-retention/run", headers=hr)
    assert res.status_code == 409 and res.json["error"]["code"] == "retention_disabled"

    for bad in ({"months_after_close": 0}, {"months_after_close": 37}, {"months_after_close": 2.5},
                {"enabled": "yes"}, {"unknown": 1}):
        assert client.put(f"{API}/settings/data-retention", json=bad, headers=hr).status_code == 400, bad

    res = client.put(f"{API}/settings/data-retention", headers={**hr, "X-Actor-Name": "Ari Admin"},
                     json={"enabled": True, "months_after_close": 6, "keep_hired": False})
    body = res.json
    assert body["enabled"] is True and body["months_after_close"] == 6 and body["keep_hired"] is False
    assert body["is_default"] is False and body["updated_by"] == "Ari Admin"
    # The scheduler is off in tests, so there is no next automatic run.
    assert body["preview"]["next_run_at"] is None
    entry = AuditLog.query.filter_by(action="settings.data_retention_updated").one()
    assert entry.details["after"]["months_after_close"] == 6


def test_run_deletes_with_full_cascade(app, client, hr, job):
    app_id, tid = setup_interview(client, hr, job)
    invite(client, hr, app_id, tid, send_email=True)  # pending invitation + email log
    cid = client.get(f"{API}/applications/{app_id}", headers=hr).json["candidate_id"]
    # Same candidate also applied to a job that is still open -> candidate kept, only the old application goes.
    job2 = _new_job(client, hr, "Still open")
    app2 = client.post(f"{API}/applications", json={"candidate_id": cid, "job_id": job2}, headers=hr).json["id"]
    # Another candidate only in the old job -> removed completely.
    other = upload(client, hr, job["id"], "budi").json
    other_cid, other_app = other["candidate"]["id"], other["application"]["id"]
    with app.app_context():
        keys = list(db.session.scalars(select(Document.storage_key).where(
            Document.application_id.in_([app_id, other_app]))))
        assert keys and db.session.scalar(select(func.count()).select_from(EmailLog)) == 1
        _set_job(job["id"], status="closed", closes_on=date.today() - timedelta(days=500))

    body = _enable(client, hr)
    assert body["preview"]["eligible_applications"] == 2 and body["preview"]["eligible_candidates"] == 1

    res = client.post(f"{API}/settings/data-retention/run", headers=hr)
    assert res.status_code == 200, res.json
    assert res.json == {"trigger": "manual", "months_after_close": 12, "keep_hired": True, "applications": 2,
                        "candidates": 1, "documents": 2, "interview_sessions": 1}
    with app.app_context():
        db.session.expire_all()
        assert db.session.get(Application, app_id) is None and db.session.get(Application, other_app) is None
        assert db.session.get(Application, app2) is not None
        assert db.session.get(Candidate, cid) is not None and db.session.get(Candidate, other_cid) is None
        assert db.session.scalar(select(func.count()).select_from(InterviewSession)) == 0
        assert db.session.scalar(select(func.count()).select_from(EmailLog)) == 0
        assert db.session.scalar(select(func.count()).select_from(StageHistory).where(
            StageHistory.application_id.in_([app_id, other_app]))) == 0
        root = Path(current_app.config["DOCUMENT_STORAGE_DIR"])
        assert not any((root / k).exists() for k in keys)
        entry = AuditLog.query.filter_by(action="data_retention.run").one()
        assert entry.details["applications"] == 2 and entry.actor_label == "HR"
        assert "Rina" not in str(entry.details) and "Budi" not in str(entry.details)
    after = client.get(f"{API}/settings/data-retention", headers=hr).json
    assert after["preview"]["eligible_applications"] == 0 and after["last_run_result"]["applications"] == 2


def test_scheduler_tick_runs_once_per_day_and_respects_disabled(app, client, hr, job):
    a = upload(client, hr, job["id"], "rina").json["application"]["id"]
    with app.app_context():
        _set_job(job["id"], status="closed", closes_on=date(2024, 1, 1))
        # Disabled: the day is claimed but nothing is deleted.
        assert retention.tick(datetime(2026, 10, 27, 1, 59, tzinfo=WIB)) == "not_due"
        assert retention.tick(datetime(2026, 10, 27, 2, 0, tzinfo=WIB)) == "disabled"
        assert db.session.get(Application, a) is not None
    _enable(client, hr)
    with app.app_context():
        # Turned on later the same day: waits for the next day's run.
        assert retention.tick(datetime(2026, 10, 27, 10, 0, tzinfo=WIB)) == "already_ran"
        assert db.session.get(Application, a) is not None
        assert retention.tick(datetime(2026, 10, 28, 2, 0, tzinfo=WIB)) == "ran"
        assert retention.tick(datetime(2026, 10, 28, 2, 5, tzinfo=WIB)) == "already_ran"
        db.session.expire_all()
        assert db.session.get(Application, a) is None
        runs = AuditLog.query.filter_by(action="data_retention.run").all()
        assert len(runs) == 1 and runs[0].actor_label == "data-retention-scheduler"
        assert runs[0].details["trigger"] == "scheduled"
        state = db.session.get(AppSetting, retention.STATE_KEY).value
        assert state["last_run_on"] == "2026-10-28"


def test_claim_day_is_exclusive(app):
    with app.app_context():
        assert retention.claim_day(date(2026, 10, 27)) is True
        assert retention.claim_day(date(2026, 10, 27)) is False
        assert retention.claim_day(date(2026, 10, 28)) is True


def test_next_run_at(app):
    with app.app_context():
        app.config["RETENTION_SCHEDULER_ENABLED"] = True
        try:
            on = {**retention.DEFAULTS, "enabled": True}
            assert retention.next_run_at(on, datetime(2026, 10, 27, 1, 0, tzinfo=WIB)) == "2026-10-27T02:00:00+07:00"
            assert retention.next_run_at(on, datetime(2026, 10, 27, 9, 0, tzinfo=WIB)) == "2026-10-28T02:00:00+07:00"
            assert retention.next_run_at(retention.DEFAULTS, datetime(2026, 10, 27, 1, 0, tzinfo=WIB)) is None
        finally:
            app.config["RETENTION_SCHEDULER_ENABLED"] = False
