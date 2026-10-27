"""GET /analytics/dashboard: KPIs, funnel, hire rate, jobs overview and attention list."""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.extensions import db
from app.models import Application, InterviewSession, Job
from tests.conftest import JOB_PAYLOAD, upload
from tests.test_decision import completed_interview, decide
from tests.test_interviews import API


def get_dashboard(client, headers):
    res = client.get(f"{API}/analytics/dashboard", headers=headers)
    assert res.status_code == 200, res.json
    return res.json


def test_empty_dashboard(client, hr):
    data = get_dashboard(client, hr)
    assert data["has_data"] is False and data["jobs"] == [] and data["attention"] == []
    assert data["kpis"]["applicants"] == 0 and data["kpis"]["hire_rate"] is None
    assert len(data["monthly"]) == 12
    assert all(m["applicants"] == m["jobs_opened"] == m["interviews_completed"] == m["hired"] == 0 for m in data["monthly"])


def test_dashboard_counts(client, hr, job):
    today = datetime.now(ZoneInfo("Asia/Jakarta")).date()
    closing = client.post(f"{API}/jobs", json=JOB_PAYLOAD | {"title": "Closing Soon", "closes_on": (today + timedelta(days=2)).isoformat()},
                          headers=hr)
    assert closing.status_code == 201, closing.json
    draft = client.post(f"{API}/jobs", json=JOB_PAYLOAD | {"title": "Draft Role", "status": "draft"}, headers=hr)
    assert draft.status_code == 201, draft.json

    hired_app, _, _ = completed_interview(client, hr, job, prefix="rina")
    assert decide(client, hr, hired_app, "accepted").status_code == 200
    waiting_app, _, waiting_sid = completed_interview(client, hr, job, prefix="dewi")
    rejected_app = upload(client, hr, job["id"], "budi").json["application"]["id"]
    res = client.patch(f"{API}/applications/{rejected_app}", json={"stage": "rejected"}, headers=hr)
    assert res.status_code == 200, res.json

    data = get_dashboard(client, hr)
    assert data["has_data"] is True and data["has_demo_data"] is False
    assert data["kpis"] == {"open_jobs": 2, "total_jobs": 3, "applicants": 3, "applicants_this_week": 3,
                            "interviews_completed": 2, "waiting_for_decision": 1, "hired": 1, "decided": 2,
                            "hire_rate": 50.0}

    # Jobs table: open jobs first (soonest deadline first), drafts last.
    assert [j["title"] for j in data["jobs"]] == ["Closing Soon", "Data Scientist", "Draft Role"]
    first, main = data["jobs"][0], data["jobs"][1]
    assert first["closes_on"] == (today + timedelta(days=2)).isoformat()
    assert first["auto_invite_on"] == (today + timedelta(days=3)).isoformat() and first["applicants"] == 0
    assert main["applicants"] == 3 and main["interviewed"] == 2 and main["hired"] == 1
    assert main["avg_match_score"] is not None and main["auto_invite_on"] is None

    decision, deadline = data["attention"]
    assert decision["kind"] == "decision" and decision["session_id"] == waiting_sid
    assert decision["application_id"] == waiting_app and decision["job_title"] == "Data Scientist"
    assert decision["completed_at"]
    assert deadline == {"kind": "job_closing", "job_id": closing.json["id"], "job_title": "Closing Soon",
                        "closes_on": (today + timedelta(days=2)).isoformat(), "days_left": 2, "applicants": 0}
    assert data["monthly"][-1] == {"month": today.strftime("%Y-%m"), "applicants": 3, "jobs_opened": 2,
                                   "interviews_completed": 2, "hired": 1}



def _month_start(today: date, back: int) -> date:
    first = today.replace(day=1)
    for _ in range(back):
        first = (first - timedelta(days=1)).replace(day=1)
    return first


def test_monthly_buckets_use_wib_and_fill_zero_months(client, hr, job):
    wib = ZoneInfo("Asia/Jakarta")
    today = datetime.now(wib).date()
    this_month, last_month, old = _month_start(today, 0), _month_start(today, 1), _month_start(today, 12)
    # 00:30 WIB on the 1st is still the previous day in UTC: it belongs to this month.
    early = datetime.combine(this_month, datetime.min.time(), tzinfo=wib) + timedelta(minutes=30)
    # 23:30 WIB on the last day of the previous month (16:30 UTC) stays in the previous month.
    late = datetime.combine(this_month, datetime.min.time(), tzinfo=wib) - timedelta(minutes=30)
    ids = [upload(client, hr, job["id"], p).json["application"]["id"] for p in ("rina", "dewi", "budi")]
    hired_app, _, sid = completed_interview(client, hr, job, prefix="andi")
    assert decide(client, hr, hired_app, "accepted").status_code == 200
    with client.application.app_context():
        for app_id, when in zip(ids, (early, late, datetime.combine(old, datetime.min.time(), tzinfo=wib))):
            db.session.get(Application, app_id).created_at = when.astimezone(timezone.utc)
        hired = db.session.get(Application, hired_app)
        hired.created_at = hired.decided_at = late.astimezone(timezone.utc)
        db.session.get(InterviewSession, sid).completed_at = late.astimezone(timezone.utc)
        main = db.session.get(Job, job["id"])
        main.opens_on = last_month
        db.session.add(Job(title="Draft never opened", status="draft", opens_on=this_month, description="x"))
        db.session.add(Job(title="Opens later", status="open", opens_on=today + timedelta(days=40), description="x"))
        db.session.commit()

    monthly = get_dashboard(client, hr)["monthly"]
    assert [m["month"] for m in monthly][-2:] == [last_month.strftime("%Y-%m"), this_month.strftime("%Y-%m")]
    assert len(monthly) == 12 and monthly[0]["month"] == _month_start(today, 11).strftime("%Y-%m")
    by_month = {m["month"]: m for m in monthly}
    assert by_month[this_month.strftime("%Y-%m")] == {"month": this_month.strftime("%Y-%m"), "applicants": 1,
                                                      "jobs_opened": 0, "interviews_completed": 0, "hired": 0}
    assert by_month[last_month.strftime("%Y-%m")] == {"month": last_month.strftime("%Y-%m"), "applicants": 2,
                                                      "jobs_opened": 1, "interviews_completed": 1, "hired": 1}
    # The application from 12 months ago is outside the window; every other month is zero-filled.
    assert sum(m["applicants"] for m in monthly) == 3
    assert all(m["applicants"] == 0 for m in monthly[:-2])
