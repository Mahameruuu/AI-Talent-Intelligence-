"""Automatic AI-interview invitations after the application period closes (scheduler + 'Send now')."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy.orm.attributes import flag_modified

from app.extensions import db
from app.models import Application, AuditLog, Document, EmailLog, InterviewSession, Job, ScreeningResult
from app.services import auto_invite
from tests.conftest import upload

API = "/api/v1/talent"
WIB = ZoneInfo("Asia/Jakarta")
PREFIXES = ("rina", "dewi", "budi", "andi", "agus", "siti")


def wib(y, m, d, h=0, mi=0):
    return datetime(y, m, d, h, mi, tzinfo=WIB)


def approve_template(client, hr, job_id):
    suggestion = client.post(f"{API}/interview-templates/suggest", json={"job_id": job_id}, headers=hr).json
    tid = client.post(f"{API}/interview-templates", json=suggestion, headers=hr).json["id"]
    assert client.post(f"{API}/interview-templates/{tid}/approve", headers=hr).status_code == 200
    return tid


def set_period(client, hr, job_id, opens="2026-10-26", closes="2026-10-30"):
    res = client.patch(f"{API}/jobs/{job_id}", json={"opens_on": opens, "closes_on": closes}, headers=hr)
    assert res.status_code == 200, res.json
    return res.json


def setup_pool(client, hr, job_id, scores):
    """Upload one CV per score and force the match scores (None = leave as screened)."""
    ids = [upload(client, hr, job_id, p).json["application"]["id"] for p in PREFIXES[:len(scores)]]
    with client.application.app_context():
        for app_id, score in zip(ids, scores):
            db.session.get(Application, app_id).match_score = score
        db.session.commit()
    return ids


def fail_knockout(client, app_id):
    with client.application.app_context():
        s = ScreeningResult.query.filter_by(application_id=app_id).order_by(ScreeningResult.id.desc()).first()
        s.requirements = s.requirements + [{"category": "screening_question", "requirement": "Bersedia di Jakarta?",
                                            "status": "not_found", "knockout": True, "evidence": []}]
        flag_modified(s, "requirements")
        db.session.commit()


def tick(client, now):
    with client.application.app_context():
        out = auto_invite.tick(now)
    db.session.expire_all()  # requests in tests share the fixture's app context (and session)
    return out


def get_job(client, hr, job_id):
    return client.get(f"{API}/jobs/{job_id}", headers=hr).json


def test_defaults_send_at_and_status_values(client, hr, job):
    ai = job["auto_invite"]
    assert ai == {"enabled": True, "top_n": 10, "min_score": None, "timing": "next_morning", "send_at": None,
                  "status": "no_deadline",
                  "template_id": None, "template_name": None, "ran_at": None, "invited_count": None,
                  "skipped": None, "error": None}
    ai = set_period(client, hr, job["id"])["auto_invite"]
    assert ai["send_at"] == "2026-10-31T08:00:00+07:00" and ai["status"] == "waiting_template"
    tid = approve_template(client, hr, job["id"])
    ai = get_job(client, hr, job["id"])["auto_invite"]
    assert ai["status"] == "scheduled" and ai["template_id"] == tid and ai["template_name"]
    off = client.patch(f"{API}/jobs/{job['id']}", json={"auto_invite": {"enabled": False}}, headers=hr).json
    assert off["auto_invite"]["status"] == "disabled" and off["auto_invite"]["top_n"] == 10

    created = client.post(f"{API}/jobs", headers=hr, json={
        "title": "Analyst", "description": "Analyse data with SQL and Python.", "closes_on": "2026-12-01",
        "auto_invite": {"top_n": 5, "min_score": 70}}).json
    assert created["auto_invite"]["top_n"] == 5 and created["auto_invite"]["min_score"] == 70
    assert created["auto_invite"]["enabled"] is True and created["auto_invite"]["send_at"] == "2026-12-02T08:00:00+07:00"


def test_patch_validation(client, hr, job):
    for bad in ({"top_n": 0}, {"top_n": 101}, {"min_score": -1}, {"min_score": 100.5}, {"enabled": "maybe"}):
        res = client.patch(f"{API}/jobs/{job['id']}", json={"auto_invite": bad}, headers=hr)
        assert res.status_code == 400, bad
        assert any(d["field"].startswith("auto_invite.") for d in res.json["error"]["details"])
    ok = client.patch(f"{API}/jobs/{job['id']}", json={"auto_invite": {"top_n": 3, "min_score": 55.5}},
                      headers=hr).json["auto_invite"]
    assert ok["top_n"] == 3 and ok["min_score"] == 55.5 and ok["enabled"] is True
    ok = client.patch(f"{API}/jobs/{job['id']}", json={"auto_invite": {"min_score": None}}, headers=hr).json
    assert ok["auto_invite"]["min_score"] is None and ok["auto_invite"]["top_n"] == 3
    ok = client.patch(f"{API}/jobs/{job['id']}", json={"title": "Renamed role"}, headers=hr).json
    assert ok["auto_invite"]["top_n"] == 3  # untouched when omitted


def test_selection_rules(client, hr, job):
    tid = approve_template(client, hr, job["id"])
    ids = setup_pool(client, hr, job["id"], [90, 80, 85, 40, 70, 75])
    fail_knockout(client, ids[0])  # best score but failed a must-have question
    # Already invited manually.
    res = client.post(f"{API}/applications/{ids[5]}/interviews", json={"template_id": tid, "send_email": False},
                      headers=hr)
    assert res.status_code == 201
    client.patch(f"{API}/jobs/{job['id']}", json={"auto_invite": {"top_n": 2, "min_score": 50}}, headers=hr)
    with client.application.app_context():
        db.session.query(ScreeningResult).filter_by(application_id=ids[4]).delete()  # not screened
        db.session.commit()
        selected, skipped = auto_invite.select(db.session.get(Job, job["id"]))
        assert [a.id for a in selected] == [ids[2], ids[1]]  # 85, 80
        assert skipped == {"knockout": 1, "below_min_score": 1, "not_screened": 1, "already_invited": 1,
                           "beyond_top_n": 0}


def test_scheduler_sends_once_after_deadline(client, hr, job):
    set_period(client, hr, job["id"])
    tid = approve_template(client, hr, job["id"])
    ids = setup_pool(client, hr, job["id"], [60, 95, 75, 50])
    fail_knockout(client, ids[3])
    client.patch(f"{API}/jobs/{job['id']}", json={"auto_invite": {"top_n": 2}}, headers=hr)

    assert tick(client, wib(2026, 10, 30, 23, 59)) == {}  # still within the application period
    assert tick(client, wib(2026, 10, 31, 7, 59)) == {job["id"]: "not_due"}
    with client.application.app_context():
        assert InterviewSession.query.count() == 0

    assert tick(client, wib(2026, 10, 31, 8, 0)) == {job["id"]: "sent"}
    with client.application.app_context():
        sessions = InterviewSession.query.all()
        assert sorted(s.application_id for s in sessions) == sorted([ids[1], ids[2]])
        assert EmailLog.query.count() == 2  # same path as bulk invite (SMTP not configured in tests -> logged)
        a = db.session.get(Application, ids[1])
        assert a.stage == "interview"
        assert [h.to_stage for h in a.stage_history][-2:] == ["shortlisted", "interview"]
        assert a.stage_history[-2].note == "Shortlisted automatically after applications closed."
        assert db.session.get(Application, ids[0]).stage != "interview"
        entry = AuditLog.query.filter_by(action="interviews.auto_invite_run").one()
        assert entry.actor_label == "auto-invite-scheduler" and entry.details["invited_count"] == 2

    ai = get_job(client, hr, job["id"])["auto_invite"]
    assert ai["status"] == "sent" and ai["invited_count"] == 2 and ai["template_id"] == tid and ai["error"] is None
    assert ai["skipped"] == {"knockout": 1, "below_min_score": 0, "not_screened": 0, "already_invited": 0,
                             "beyond_top_n": 1}
    assert ai["ran_at"].endswith("+07:00")

    assert tick(client, wib(2026, 10, 31, 9, 0)) == {}  # never re-sent automatically
    with client.application.app_context():
        assert InterviewSession.query.count() == 2
    # Moving the deadline later after sending keeps it "sent".
    later = set_period(client, hr, job["id"], closes="2026-11-15")["auto_invite"]
    assert later["status"] == "sent" and later["send_at"] == "2026-11-16T08:00:00+07:00"
    assert tick(client, wib(2026, 11, 16, 8, 0)) == {}


def test_claim_prevents_double_send(client, hr, job):
    set_period(client, hr, job["id"])
    approve_template(client, hr, job["id"])
    setup_pool(client, hr, job["id"], [80])
    with client.application.app_context():
        assert auto_invite.claim(job["id"], scheduled=True)  # another process holds the lease
        assert not auto_invite.claim(job["id"], scheduled=True)
    assert tick(client, wib(2026, 10, 31, 8, 5)) == {job["id"]: "claimed_elsewhere"}
    with client.application.app_context():
        assert InterviewSession.query.count() == 0
        auto_invite.release(job["id"])
    assert tick(client, wib(2026, 10, 31, 8, 10)) == {job["id"]: "sent"}


def test_waits_for_cvs_still_processing(client, hr, job):
    set_period(client, hr, job["id"])
    approve_template(client, hr, job["id"])
    ids = setup_pool(client, hr, job["id"], [80, 70])
    with client.application.app_context():
        doc = Document.query.filter_by(application_id=ids[1]).first()
        doc.status = "processing"
        db.session.query(ScreeningResult).filter_by(application_id=ids[1]).delete()
        db.session.commit()
    assert tick(client, wib(2026, 10, 31, 8, 0)) == {job["id"]: "waiting_documents"}
    assert tick(client, wib(2026, 10, 31, 9, 59)) == {job["id"]: "waiting_documents"}
    assert get_job(client, hr, job["id"])["auto_invite"]["status"] == "scheduled"
    assert tick(client, wib(2026, 10, 31, 10, 0)) == {job["id"]: "sent"}  # 2 hours later: go ahead
    ai = get_job(client, hr, job["id"])["auto_invite"]
    assert ai["invited_count"] == 1 and ai["skipped"]["not_screened"] == 1


def test_waits_for_approved_template(client, hr, job):
    set_period(client, hr, job["id"])
    setup_pool(client, hr, job["id"], [80])
    assert tick(client, wib(2026, 11, 2, 8, 0)) == {job["id"]: "waiting_template"}
    assert get_job(client, hr, job["id"])["auto_invite"]["status"] == "waiting_template"
    approve_template(client, hr, job["id"])
    assert tick(client, wib(2026, 11, 2, 8, 5)) == {job["id"]: "sent"}  # first tick after approval


def test_disabled_and_failed_runs(client, hr, job, monkeypatch):
    set_period(client, hr, job["id"])
    approve_template(client, hr, job["id"])
    setup_pool(client, hr, job["id"], [80])
    client.patch(f"{API}/jobs/{job['id']}", json={"auto_invite": {"enabled": False}}, headers=hr)
    assert tick(client, wib(2026, 10, 31, 8, 0)) == {}
    client.patch(f"{API}/jobs/{job['id']}", json={"auto_invite": {"enabled": True}}, headers=hr)

    def boom(job):
        raise RuntimeError("database hiccup")

    monkeypatch.setattr(auto_invite, "select", boom)
    assert tick(client, wib(2026, 10, 31, 8, 0)) == {job["id"]: "failed"}
    ai = get_job(client, hr, job["id"])["auto_invite"]
    assert ai["status"] == "failed" and "database hiccup" in ai["error"]
    monkeypatch.undo()
    assert tick(client, wib(2026, 10, 31, 8, 5)) == {job["id"]: "sent"}  # retried on the next tick
    ai = get_job(client, hr, job["id"])["auto_invite"]
    assert ai["status"] == "sent" and ai["error"] is None


def test_manual_run_endpoint(client, hr, job):
    url = f"{API}/jobs/{job['id']}/auto-invite/run"
    assert client.post(f"{API}/jobs/999999/auto-invite/run", headers=hr).status_code == 404
    ids = setup_pool(client, hr, job["id"], [80, 70])
    res = client.post(url, headers=hr)
    assert res.status_code == 409 and res.json["error"]["code"] == "no_approved_template"

    approve_template(client, hr, job["id"])
    client.patch(f"{API}/jobs/{job['id']}", json={"auto_invite": {"top_n": 1}}, headers=hr)
    res = client.post(url, headers=hr)  # no deadline needed: "Send now"
    assert res.status_code == 200, res.json
    assert res.json["id"] == job["id"] and res.json["auto_invite"]["status"] == "sent"
    assert res.json["auto_invite"]["invited_count"] == 1
    with client.application.app_context():
        assert [s.application_id for s in InterviewSession.query.all()] == [ids[0]]
        entry = AuditLog.query.filter_by(action="interviews.auto_invite_run").one()
        assert entry.actor_label == "HR" and entry.details["trigger"] == "manual"

    again = client.post(url, headers=hr).json  # runs again, only for applicants not yet invited
    assert again["auto_invite"]["invited_count"] == 1 and again["auto_invite"]["skipped"]["already_invited"] == 1
    with client.application.app_context():
        assert sorted(s.application_id for s in InterviewSession.query.all()) == sorted(ids)


def test_send_at_for_both_timings(client, hr, job):
    jid = job["id"]
    res = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"opens_on": "2026-10-26", "closes_on": "2026-10-27",
                                                              "closes_time": "14:00"}).json
    assert res["auto_invite"]["timing"] == "next_morning"
    assert res["auto_invite"]["send_at"] == "2026-10-28T08:00:00+07:00"  # unchanged by closes_time
    res = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"auto_invite": {"timing": "on_close"}}).json
    assert res["auto_invite"]["timing"] == "on_close" and res["auto_invite"]["send_at"] == "2026-10-27T14:00:00+07:00"
    assert res["auto_invite"]["top_n"] == 10  # other keys untouched
    # Without a closing time the period lasts the whole day: sent at midnight.
    res = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"closes_time": None}).json
    assert res["auto_invite"]["send_at"] == "2026-10-28T00:00:00+07:00"
    bad = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"auto_invite": {"timing": "whenever"}})
    assert bad.status_code == 400 and bad.json["error"]["details"][0]["field"] == "auto_invite.timing"
    created = client.post(f"{API}/jobs", headers=hr, json={
        "title": "Analyst", "description": "Analyse data with SQL and Python.", "closes_on": "2026-12-01",
        "closes_time": "09:30", "auto_invite": {"timing": "on_close"}}).json
    assert created["auto_invite"]["send_at"] == "2026-12-01T09:30:00+07:00"


def test_scheduler_sends_on_close_right_after_closing_time(client, hr, job):
    jid = job["id"]
    res = client.patch(f"{API}/jobs/{jid}", headers=hr, json={
        "opens_on": "2026-10-26", "closes_on": "2026-10-27", "closes_time": "14:00",
        "auto_invite": {"timing": "on_close", "top_n": 1}})
    assert res.status_code == 200, res.json
    approve_template(client, hr, jid)
    ids = setup_pool(client, hr, jid, [70, 90])

    assert tick(client, wib(2026, 10, 26, 23, 0)) == {}  # closing day not reached: not even loaded
    assert tick(client, wib(2026, 10, 27, 13, 59)) == {jid: "not_due"}  # applications still open
    with client.application.app_context():
        assert InterviewSession.query.count() == 0
    assert tick(client, wib(2026, 10, 27, 14, 0)) == {jid: "sent"}  # first tick after closing
    with client.application.app_context():
        assert [s.application_id for s in InterviewSession.query.all()] == [ids[1]]
    assert get_job(client, hr, jid)["auto_invite"]["status"] == "sent"
    assert tick(client, wib(2026, 10, 27, 14, 1)) == {}  # never twice


def test_on_close_still_waits_for_cvs_processing(client, hr, job):
    jid = job["id"]
    client.patch(f"{API}/jobs/{jid}", headers=hr, json={
        "closes_on": "2026-10-27", "closes_time": "14:00", "auto_invite": {"timing": "on_close"}})
    approve_template(client, hr, jid)
    ids = setup_pool(client, hr, jid, [80, 70])
    with client.application.app_context():
        Document.query.filter_by(application_id=ids[1]).first().status = "processing"
        db.session.commit()
    assert tick(client, wib(2026, 10, 27, 14, 1)) == {jid: "waiting_documents"}
    assert tick(client, wib(2026, 10, 27, 16, 0)) == {jid: "sent"}  # max 2 hours after send_at


def test_next_morning_job_not_loaded_on_closing_day(client, hr, job):
    jid = job["id"]
    client.patch(f"{API}/jobs/{jid}", headers=hr, json={"closes_on": "2026-10-27", "closes_time": "10:00"})
    approve_template(client, hr, jid)
    assert tick(client, wib(2026, 10, 27, 23, 0)) == {}
    assert tick(client, wib(2026, 10, 28, 7, 59)) == {jid: "not_due"}
