"""Application period with times of day (WIB): opens_on opens_time .. closes_on closes_time."""

from datetime import date, datetime, time
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.services import job_period
from app.services.forms import reset_rate_limit
from tests.test_forms import answers, make_form, submit

API = "/api/v1/talent"
WIB = ZoneInfo("Asia/Jakarta")


@pytest.fixture(autouse=True)
def _reset_limits():
    reset_rate_limit()


def wib(y, m, d, h=0, mi=0, s=0):
    return datetime(y, m, d, h, mi, s, tzinfo=WIB)


def period(opens_on=None, opens_time=None, closes_on=None, closes_time=None):
    return SimpleNamespace(opens_on=opens_on, opens_time=opens_time, closes_on=closes_on, closes_time=closes_time)


@pytest.fixture()
def ctx(app):
    with app.app_context():
        yield


def test_closing_time_on_the_closing_day(ctx):
    p = period(date(2026, 10, 20), None, date(2026, 10, 27), time(14, 0))
    assert job_period.window(p, wib(2026, 10, 27, 13, 59, 59)) == "open"
    assert job_period.days_left(p, wib(2026, 10, 27, 13, 59)) == 0
    assert job_period.window(p, wib(2026, 10, 27, 14, 0)) == "ended"
    assert job_period.days_left(p, wib(2026, 10, 27, 14, 0)) is None
    assert job_period.days_left(p, wib(2026, 10, 25, 20, 0)) == 2
    assert job_period.closes_at(p).isoformat() == "2026-10-27T14:00:00+07:00"


def test_opening_time_on_the_opening_day(ctx):
    p = period(date(2026, 10, 27), time(9, 30), date(2026, 10, 30), None)
    assert job_period.window(p, wib(2026, 10, 27, 9, 29)) == "upcoming"
    assert job_period.window(p, wib(2026, 10, 27, 9, 30)) == "open"
    assert job_period.opens_at(p).isoformat() == "2026-10-27T09:30:00+07:00"
    # A UTC "now" is compared in WIB: 02:30 UTC = 09:30 WIB.
    assert job_period.window(p, datetime(2026, 10, 27, 2, 29, tzinfo=ZoneInfo("UTC"))) == "upcoming"


def test_null_times_keep_whole_day_behaviour(ctx):
    p = period(date(2026, 10, 27), None, date(2026, 10, 30), None)
    assert job_period.window(p, wib(2026, 10, 26, 23, 59, 59)) == "upcoming"
    assert job_period.window(p, wib(2026, 10, 27, 0, 0)) == "open"
    assert job_period.window(p, wib(2026, 10, 30, 23, 59, 59)) == "open"
    assert job_period.days_left(p, wib(2026, 10, 30, 23, 59)) == 0
    assert job_period.window(p, wib(2026, 10, 31, 0, 0)) == "ended"
    assert job_period.opens_at(p).isoformat() == "2026-10-27T00:00:00+07:00"
    assert job_period.closes_at(p).isoformat() == "2026-10-30T23:59:59+07:00"
    assert job_period.window(period()) is None


def test_job_response_and_validation(client, hr, job):
    jid = job["id"]
    assert {k: job[k] for k in ("opens_time", "closes_time", "opens_at", "closes_at")} == dict.fromkeys(
        ("opens_time", "closes_time", "opens_at", "closes_at"))
    res = client.patch(f"{API}/jobs/{jid}", headers=hr, json={
        "opens_on": "2026-10-27", "opens_time": "09:00", "closes_on": "2026-10-27", "closes_time": "14:00"})
    assert res.status_code == 200, res.json
    body = res.json
    assert body["opens_time"] == "09:00" and body["closes_time"] == "14:00"
    assert body["opens_at"] == "2026-10-27T09:00:00+07:00" and body["closes_at"] == "2026-10-27T14:00:00+07:00"

    # Closing must come after opening (same day).
    bad = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"closes_time": "09:00"})
    assert bad.status_code == 400 and "closes_time" in bad.json["error"]["details"]["fields"]
    bad = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"opens_time": "15:00"})
    assert bad.status_code == 400 and "closes_time" in bad.json["error"]["details"]["fields"]
    bad = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"closes_on": "2026-10-26"})
    assert bad.status_code == 400 and "closes_on" in bad.json["error"]["details"]["fields"]
    for value in ("9:00", "24:00", "14:60", "2pm", 1400):
        bad = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"closes_time": value})
        assert bad.status_code == 400, value
        assert bad.json["error"]["details"][0]["field"] == "closes_time"
    # Seconds are accepted but dropped; clearing a time falls back to the whole day.
    ok = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"closes_time": "16:45:30"}).json
    assert ok["closes_time"] == "16:45" and ok["closes_at"] == "2026-10-27T16:45:00+07:00"
    ok = client.patch(f"{API}/jobs/{jid}", headers=hr, json={"opens_time": None, "closes_time": None}).json
    assert ok["opens_at"] == "2026-10-27T00:00:00+07:00" and ok["closes_at"] == "2026-10-27T23:59:59+07:00"
    assert ok["opens_time"] is None and ok["closes_time"] is None


def test_public_form_closed_reason_uses_times(client, hr, job, monkeypatch):
    now = {"value": wib(2026, 10, 27, 8, 0)}
    monkeypatch.setattr(job_period, "now_local", lambda: now["value"])
    form = make_form(client, hr, job)
    client.patch(f"{API}/jobs/{job['id']}", headers=hr, json={
        "opens_on": "2026-10-27", "opens_time": "09:00", "closes_on": "2026-10-27", "closes_time": "14:00"})

    public = client.get(f"{API}/public/forms/{form['slug']}").json
    assert public["closed_reason"] == "not_yet_open"
    assert public["job"]["opens_time"] == "09:00" and public["job"]["closes_time"] == "14:00"
    assert public["job"]["closes_at"] == "2026-10-27T14:00:00+07:00"
    res = submit(client, form["slug"], answers(form))
    assert res.status_code == 410 and res.json["error"]["code"] == "not_yet_open"
    assert "2026-10-27 at 09:00 WIB" in res.json["error"]["message"]

    now["value"] = wib(2026, 10, 27, 13, 59)
    public = client.get(f"{API}/public/forms/{form['slug']}").json
    assert public["accepting_applications"] is True and public["closed_reason"] is None
    assert submit(client, form["slug"], answers(form)).status_code == 201

    now["value"] = wib(2026, 10, 27, 14, 0)
    assert client.get(f"{API}/public/forms/{form['slug']}").json["closed_reason"] == "deadline_passed"
    res = submit(client, form["slug"], answers(form, email="other@example.com"))
    assert res.status_code == 410 and res.json["error"]["code"] == "deadline_passed"

    hr_form = client.get(f"{API}/jobs/{job['id']}/form", headers=hr).json
    assert hr_form["job_closes_time"] == "14:00" and hr_form["job_opens_at"] == "2026-10-27T09:00:00+07:00"
    hr_job = client.get(f"{API}/jobs/{job['id']}", headers=hr).json
    assert hr_job["application_window"] == "ended" and hr_job["days_left"] is None


def test_dashboard_closing_soon_uses_exact_time(client, hr, job, monkeypatch):
    from app.services import analytics

    class FrozenDatetime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = wib(2026, 10, 27, 15, 0)
            return value.astimezone(tz) if tz else value.replace(tzinfo=None)

    monkeypatch.setattr(analytics, "datetime", FrozenDatetime)
    monkeypatch.setattr(job_period, "now_local", lambda: wib(2026, 10, 27, 15, 0))
    # Closed at 14:00 today: not "closing soon" any more.
    client.patch(f"{API}/jobs/{job['id']}", headers=hr, json={
        "closes_on": "2026-10-27", "closes_time": "14:00", "auto_invite": {"timing": "on_close"}})
    other = client.post(f"{API}/jobs", headers=hr, json={
        "title": "Analyst", "description": "Analyse data with SQL and Python.", "closes_on": "2026-10-27",
        "closes_time": "17:00"}).json
    dash = client.get(f"{API}/analytics/dashboard", headers=hr).json
    closing = [i for i in dash["attention"] if i["kind"] == "job_closing"]
    assert [i["job_id"] for i in closing] == [other["id"]]
    assert closing[0]["closes_time"] == "17:00" and closing[0]["closes_at"] == "2026-10-27T17:00:00+07:00"
    assert closing[0]["days_left"] == 0
    rows = {r["job_id"]: r for r in dash["jobs"]}
    assert rows[job["id"]]["auto_invite_at"] == "2026-10-27T14:00:00+07:00"
    assert rows[job["id"]]["auto_invite_on"] == "2026-10-27"
    assert rows[other["id"]]["auto_invite_at"] == "2026-10-28T08:00:00+07:00"
    assert rows[other["id"]]["closes_time"] == "17:00"
