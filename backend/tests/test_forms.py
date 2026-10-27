"""Public application forms: HR builder, public link, applicant submission -> NLP -> screening."""

import io
import json

import pytest

from app.extensions import db
from app.models import Application, Candidate
from app.services.forms import reset_rate_limit
from tests.conftest import sample_bytes

API = "/api/v1/talent"


@pytest.fixture(autouse=True)
def _reset_limits():
    reset_rate_limit()


def make_form(client, hr, job, publish=True):
    res = client.post(f"{API}/jobs/{job['id']}/form", headers=hr)
    assert res.status_code == 201, res.json
    fields = [
        {"label": "City", "type": "short_text", "required": True},
        {"label": "Notice period", "type": "select", "required": True, "options": ["Now", "1 month"]},
        {"label": "Portfolio", "type": "url", "required": False},
        {"label": "Tools", "type": "multi_select", "required": False, "options": ["Git", "Docker", "Jira"]},
    ]
    res = client.put(f"{API}/jobs/{job['id']}/form", headers=hr, json={"title": "Join us", "fields": fields})
    assert res.status_code == 200, res.json
    if publish:
        res = client.post(f"{API}/jobs/{job['id']}/form/publish", headers=hr)
        assert res.json["status"] == "published"
    return res.json


def answers(form, **overrides):
    ids = {f["label"]: f["id"] for f in form["fields"]}
    data = {"full_name": "Rina Wijaya", "email": "rina@example.com", "phone": "+62 812 3456 7890",
            ids["City"]: "Jakarta", ids["Notice period"]: "Now", ids["Tools"]: ["Git", "Docker"]}
    data.update(overrides)
    return data


def submit(client, slug, data, prefix="rina", consent="true", cv=True, extra=None):
    payload = {"answers": json.dumps(data), "consent": consent, **(extra or {})}
    if cv:
        name, content = sample_bytes(prefix)
        payload["cv"] = (io.BytesIO(content), name)
    return client.post(f"{API}/public/forms/{slug}/submit", data=payload, content_type="multipart/form-data")


def test_builder_validation(client, hr, job):
    client.post(f"{API}/jobs/{job['id']}/form", headers=hr)
    assert client.post(f"{API}/jobs/{job['id']}/form", headers=hr).status_code == 409
    bad = client.put(f"{API}/jobs/{job['id']}/form", headers=hr,
                     json={"fields": [{"label": "Pick", "type": "select", "options": ["only one"]}]})
    assert bad.status_code == 400 and "two options" in bad.json["error"]["message"]
    bad = client.put(f"{API}/jobs/{job['id']}/form", headers=hr, json={"fields": [{"label": "X", "type": "html"}]})
    assert bad.status_code == 400
    # Built-in ids cannot be hijacked by custom fields.
    ok = client.put(f"{API}/jobs/{job['id']}/form", headers=hr,
                    json={"fields": [{"id": "email", "label": "Second email", "type": "email"}]})
    assert ok.json["fields"][0]["id"] != "email"
    assert [f["id"] for f in ok.json["built_in_fields"]] == ["full_name", "email", "phone", "cv"]


def test_fields_always_have_full_shape(client, hr, job):
    created = client.post(f"{API}/jobs/{job['id']}/form", headers=hr).json  # default suggested fields
    client.post(f"{API}/jobs/{job['id']}/form/publish", headers=hr)
    public = client.get(f"{API}/public/forms/{created['slug']}").json
    shape = {"id", "label", "type", "required", "help_text", "placeholder", "options", "max_length"}
    for field in created["fields"]:
        assert set(field) == shape | {"screening"}  # HR sees the screening rule
    for field in public["fields"]:
        assert set(field) == shape  # applicants never see expected answers


def test_draft_form_is_not_public(client, hr, job):
    form = make_form(client, hr, job, publish=False)
    assert client.get(f"{API}/public/forms/{form['slug']}").status_code == 404
    assert client.get(f"{API}/public/forms/does-not-exist").status_code == 404


def test_public_submission_creates_screened_application(client, hr, job):
    form = make_form(client, hr, job)
    assert form["public_url"].endswith(f"/apply/{form['slug']}")
    public = client.get(f"{API}/public/forms/{form['slug']}").json
    assert public["accepting_applications"] and public["job"]["title"] == "Data Scientist"
    assert "description" in public["job"] and "weights" not in public["job"]  # no internal scoring config

    res = submit(client, form["slug"], answers(form))
    assert res.status_code == 201, res.json
    assert res.json["reference"].startswith("APP-")

    apps = client.get(f"{API}/jobs/{job['id']}/applications", headers=hr).json["items"]
    assert len(apps) == 1
    app = apps[0]
    assert app["source"] == "public_form" and app["candidate_name"] == "Rina Wijaya"
    by_label = {a["label"]: a["value"] for a in app["form_answers"]}
    assert by_label["City"] == "Jakarta" and by_label["Tools"] == ["Git", "Docker"] and by_label["Portfolio"] is None
    # CV went through the pipeline and was screened automatically.
    assert app["latest_document"]["status"] == "completed" and app["match_score"] is not None
    assert client.get(f"{API}/forms", headers=hr).json[0]["submission_count"] == 1


def test_cv_that_does_not_match_form_details_is_flagged(client, hr, job):
    form = make_form(client, hr, job)
    # Applicant "Dimas" uploads Rina's CV.
    assert submit(client, form["slug"], answers(form, full_name="Dimas Prasetyo", email="dimas@example.com")).status_code == 201
    app = client.get(f"{API}/jobs/{job['id']}/applications", headers=hr).json["items"][0]
    codes = {f["code"] for f in client.get(f"{API}/applications/{app['id']}/screening", headers=hr).json["flags"]}
    assert {"name_mismatch", "contact_mismatch"} <= codes
    # A matching applicant gets no such flags.
    other = client.post(f"{API}/jobs", headers=hr, json={**{k: job[k] for k in (
        "description", "required_skills")}, "title": "ML Engineer"}).json
    form2 = make_form(client, hr, other)
    submit(client, form2["slug"], answers(form2, full_name="Rina Wijaya", email="rina.wijaya@example.com"))
    app2 = client.get(f"{API}/jobs/{other['id']}/applications", headers=hr).json["items"][0]
    codes2 = {f["code"] for f in client.get(f"{API}/applications/{app2['id']}/screening", headers=hr).json["flags"]}
    assert not {"name_mismatch", "contact_mismatch"} & codes2


def test_validation_errors_are_per_field(client, hr, job):
    form = make_form(client, hr, job)
    ids = {f["label"]: f["id"] for f in form["fields"]}
    res = submit(client, form["slug"], answers(form, email="not-an-email", **{ids["Notice period"]: "Someday",
                                                                              ids["Portfolio"]: "ftp://x"}), cv=False)
    assert res.status_code == 400
    errs = res.json["error"]["details"]["fields"]
    assert set(errs) == {"email", ids["Notice period"], ids["Portfolio"], "cv"}
    assert submit(client, form["slug"], answers(form), consent="false").json["error"]["code"] == "consent_required"
    bad_cv = client.post(f"{API}/public/forms/{form['slug']}/submit", content_type="multipart/form-data",
                         data={"answers": json.dumps(answers(form)), "consent": "true",
                               "cv": (io.BytesIO(b"plain text"), "cv.txt")})
    assert bad_cv.status_code == 400 and "cv" in bad_cv.json["error"]["details"]["fields"]
    with client.application.app_context():
        assert Candidate.query.count() == 0 and Application.query.count() == 0  # nothing half-created


def test_duplicate_and_returning_applicants(client, hr, job):
    form = make_form(client, hr, job)
    assert submit(client, form["slug"], answers(form)).status_code == 201
    dup = submit(client, form["slug"], answers(form, email="RINA@example.com"))
    assert dup.status_code == 409 and dup.json["error"]["code"] == "already_applied"
    # Same person applying to a second job reuses the candidate profile.
    other = client.post(f"{API}/jobs", headers=hr, json={**{k: v for k, v in job.items() if k in (
        "description", "required_skills", "preferred_skills")}, "title": "ML Engineer"}).json
    form2 = make_form(client, hr, other)
    assert submit(client, form2["slug"], answers(form2)).status_code == 201
    with client.application.app_context():
        assert Candidate.query.count() == 1 and Application.query.count() == 2


def test_closed_form_and_honeypot(client, hr, job):
    form = make_form(client, hr, job)
    bot = submit(client, form["slug"], answers(form), extra={"website": "http://spam"})
    assert bot.status_code == 201
    with client.application.app_context():
        assert Application.query.count() == 0  # silently discarded
    client.post(f"{API}/jobs/{job['id']}/form/close", headers=hr)
    assert client.get(f"{API}/public/forms/{form['slug']}").json["accepting_applications"] is False
    res = submit(client, form["slug"], answers(form))
    assert res.status_code == 410 and res.json["error"]["code"] == "form_closed"


def test_regenerated_link_invalidates_old(client, hr, job):
    form = make_form(client, hr, job)
    new = client.post(f"{API}/jobs/{job['id']}/form/regenerate-link", headers=hr).json
    assert new["slug"] != form["slug"]
    assert client.get(f"{API}/public/forms/{form['slug']}").status_code == 404
    assert client.get(f"{API}/public/forms/{new['slug']}").status_code == 200


def test_rate_limit(client, hr, job):
    form = make_form(client, hr, job)
    codes = [submit(client, form["slug"], answers(form, email=f"a{i}@example.com"), cv=False).status_code
             for i in range(11)]
    assert codes[:10] == [400] * 10 and codes[10] == 429


def _jakarta_today():
    from datetime import datetime
    from zoneinfo import ZoneInfo

    return datetime.now(ZoneInfo("Asia/Jakarta")).date()


def test_job_application_period(client, hr, job):
    from datetime import timedelta

    today = _jakarta_today()
    bad = client.patch(f"{API}/jobs/{job['id']}", headers=hr,
                       json={"opens_on": str(today), "closes_on": str(today - timedelta(days=1))})
    assert bad.status_code == 400 and "closes_on" in bad.json["error"]["details"]["fields"]

    form = make_form(client, hr, job)

    # Not open yet: visible, but applications are refused with a clear reason.
    upcoming = client.patch(f"{API}/jobs/{job['id']}", headers=hr,
                            json={"opens_on": str(today + timedelta(days=3)), "closes_on": str(today + timedelta(days=10))}).json
    assert upcoming["application_window"] == "upcoming" and upcoming["days_left"] == 10
    public = client.get(f"{API}/public/forms/{form['slug']}").json
    assert public["accepting_applications"] is False and public["closed_reason"] == "not_yet_open"
    assert public["job"]["opens_on"] == str(today + timedelta(days=3))
    res = submit(client, form["slug"], answers(form))
    assert res.status_code == 410 and res.json["error"]["code"] == "not_yet_open"

    # Deadline is today: still open until 23:59 local time.
    current = client.patch(f"{API}/jobs/{job['id']}", headers=hr,
                           json={"opens_on": str(today - timedelta(days=5)), "closes_on": str(today)}).json
    assert current["application_window"] == "open" and current["days_left"] == 0
    assert submit(client, form["slug"], answers(form)).status_code == 201

    # Deadline passed.
    ended = client.patch(f"{API}/jobs/{job['id']}", headers=hr,
                         json={"closes_on": str(today - timedelta(days=1))}).json
    assert ended["application_window"] == "ended" and ended["days_left"] is None
    assert client.get(f"{API}/public/forms/{form['slug']}").json["closed_reason"] == "deadline_passed"
    res = submit(client, form["slug"], answers(form, email="other@example.com"))
    assert res.status_code == 410 and res.json["error"]["code"] == "deadline_passed"



def test_screening_questions_and_job_details(client, hr, job):
    # Employment type and salary: shown to applicants only when salary_visible.
    bad = client.patch(f"{API}/jobs/{job['id']}", headers=hr, json={"salary_min": 20_000_000, "salary_max": 10_000_000})
    assert bad.status_code == 400 and "salary_max" in bad.json["error"]["details"]["fields"]
    updated = client.patch(f"{API}/jobs/{job['id']}", headers=hr, json={
        "employment_type": "contract", "salary_min": 12_000_000, "salary_max": 18_000_000, "salary_visible": False}).json
    assert updated["employment_type"] == "contract" and updated["salary_max"] == 18_000_000

    client.post(f"{API}/jobs/{job['id']}/form", headers=hr)
    fields = [
        {"label": "Bersedia ditempatkan di Jakarta?", "type": "yes_no", "required": True,
         "screening": {"enabled": True, "expected": "yes", "knockout": True}},
        {"label": "Kapan bisa mulai?", "type": "select", "required": True, "options": ["Segera", "1 bulan", "3 bulan"],
         "screening": {"enabled": True, "accepted": ["Segera", "1 bulan"]}},
        {"label": "Ekspektasi gaji", "type": "number", "required": True,
         "screening": {"enabled": True, "max": 15_000_000}},
        {"label": "Catatan", "type": "long_text", "required": False},
    ]
    bad = client.put(f"{API}/jobs/{job['id']}/form", headers=hr,
                     json={"fields": [{"label": "Bio", "type": "long_text", "screening": {"enabled": True}}]})
    assert bad.status_code == 400 and "can't be a screening question" in bad.json["error"]["message"]
    form = client.put(f"{API}/jobs/{job['id']}/form", headers=hr, json={"fields": fields}).json
    client.post(f"{API}/jobs/{job['id']}/form/publish", headers=hr)
    assert form["fields"][0]["screening"] == {"enabled": True, "knockout": True, "expected": "yes"}

    public = client.get(f"{API}/public/forms/{form['slug']}").json
    assert all("screening" not in f for f in public["fields"])  # expected answers stay private
    assert public["job"]["employment_type"] == "contract" and public["job"]["salary_max"] is None  # hidden

    ids = [f["id"] for f in form["fields"]]
    data = {"full_name": "Rina Wijaya", "email": "rina@example.com", "phone": "+62 812 3456 7890",
            ids[0]: "no", ids[1]: "Segera", ids[2]: 20_000_000}
    assert submit(client, form["slug"], data).status_code == 201

    app = client.get(f"{API}/jobs/{job['id']}/applications", headers=hr).json["items"][0]
    screening = client.get(f"{API}/applications/{app['id']}/screening", headers=hr).json
    sq = {r["requirement"]: r for r in screening["requirements"] if r["category"] == "screening_question"}
    assert sq["Bersedia ditempatkan di Jakarta?"]["status"] == "not_found"
    assert "expected Yes" in sq["Bersedia ditempatkan di Jakarta?"]["explanation"]
    assert sq["Kapan bisa mulai?"]["status"] == "matched"
    assert sq["Ekspektasi gaji"]["status"] == "not_found" and "at most 15.000.000" in sq["Ekspektasi gaji"]["explanation"]
    comp = {c["component"]: c for c in screening["components"]}["screening_questions"]
    assert comp["score"] == 33.3 and comp["weight"] == 15
    assert any(f["code"] == "knockout_not_met" for f in screening["flags"])
    assert app["stage"] == "screening"  # flagged, never auto-rejected
