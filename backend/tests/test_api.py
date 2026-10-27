"""API tests: no-login access, actor attribution, jobs, CV upload -> NLP -> screening, reviews, analytics, Swagger."""

import io

from app.extensions import db
from app.models import Actor, AuditLog, Document
from tests.conftest import JOB_PAYLOAD, sample_bytes, upload

API = "/api/v1/talent"


def test_hr_endpoints_work_without_authorization(client):
    """There is no login: HR endpoints answer without any Authorization header (the central system handles auth)."""
    assert client.get(f"{API}/jobs").status_code == 200
    assert client.get(f"{API}/candidates").status_code == 200
    assert client.get(f"{API}/applications").status_code == 200
    assert client.get(f"{API}/analytics/dashboard").status_code == 200
    assert client.get(f"{API}/settings/data-retention").status_code == 200
    assert client.post(f"{API}/jobs", json=JOB_PAYLOAD).status_code == 201


def test_auth_and_user_endpoints_are_gone(client):
    assert client.post(f"{API}/auth/login", json={"email": "a@b.c", "password": "x"}).status_code == 404
    assert client.get(f"{API}/auth/me").status_code == 404
    assert client.get(f"{API}/users").status_code == 404


def test_actor_header_attribution_and_default_actor(client, job):
    with client.application.app_context():
        entry = AuditLog.query.filter_by(action="job.created").one()
        assert entry.actor_label == "HR" and entry.actor_id is not None  # no header -> built-in actor "HR"
    headers = {"X-Actor-Name": "Sari Rekruter", "X-Actor-Id": "central-42"}
    client.patch(f"{API}/jobs/{job['id']}", json={"title": "Renamed"}, headers=headers)
    client.patch(f"{API}/jobs/{job['id']}", json={"title": "Renamed again"},
                 headers={"X-Actor-Name": "Sari R.", "X-Actor-Id": "central-42"})
    client.patch(f"{API}/jobs/{job['id']}", json={"title": "By name only"}, headers={"X-Actor-Name": "Budi"})
    client.patch(f"{API}/jobs/{job['id']}", json={"title": "Again by name"}, headers={"X-Actor-Name": "  Budi "})
    with client.application.app_context():
        updates = AuditLog.query.filter_by(action="job.updated").order_by(AuditLog.id).all()
        assert [u.actor_label for u in updates] == ["Sari Rekruter", "Sari R.", "Budi", "Budi"]
        assert updates[0].actor_id == updates[1].actor_id  # same X-Actor-Id -> same actor (renamed)
        assert updates[2].actor_id == updates[3].actor_id != updates[0].actor_id
        actor = db.session.get(Actor, updates[0].actor_id)
        assert actor.external_id == "central-42" and actor.full_name == "Sari R."
    # Over-long values are truncated, never rejected.
    res = client.patch(f"{API}/jobs/{job['id']}", json={"title": "Long"}, headers={"X-Actor-Name": "x" * 400})
    assert res.status_code == 200
    with client.application.app_context():
        assert len(AuditLog.query.filter_by(action="job.updated").order_by(AuditLog.id.desc()).first().actor_label) == 255


def test_job_crud_and_validation(client, hr):
    res = client.post(f"{API}/jobs", json={**JOB_PAYLOAD, "title": ""}, headers=hr)
    assert res.status_code == 400 and res.json["error"]["details"]
    res = client.post(f"{API}/jobs", json=JOB_PAYLOAD, headers=hr)
    assert res.status_code == 201
    job = res.json
    assert job["required_skills"] == JOB_PAYLOAD["required_skills"] and job["weights"]["required_skills"] == 35
    # Per-job weights are ignored: weights are organisation-wide (Settings).
    res = client.patch(f"{API}/jobs/{job['id']}", json={"status": "closed", "weights": {"semantic": 0}}, headers=hr)
    assert res.json["status"] == "closed" and res.json["weights"]["semantic"] == 5
    assert res.json["required_skills"] == JOB_PAYLOAD["required_skills"]
    listing = client.get(f"{API}/jobs?q=data", headers=hr).json
    assert listing["total"] == 1 and listing["items"][0]["candidate_count"] == 0


def test_upload_processes_cv_and_screens(client, hr, job):
    res = upload(client, hr, job["id"], "rina")
    assert res.status_code == 202, res.json
    doc = res.json["document"]
    app_id = res.json["application"]["id"]
    # Worker runs inline in tests, so processing is finished.
    status = client.get(f"{API}/documents/{doc['id']}/status", headers=hr).json
    assert status["status"] == "completed"
    assert {s["name"] for s in status["steps"]} >= {"validate", "extract_text", "sections", "skills", "experience"}

    detail = client.get(f"{API}/documents/{doc['id']}", headers=hr).json
    assert detail["extraction"]["name"]["value"] == "Rina Wijaya"
    assert detail["methods"]["llm"] == "disabled"
    assert "RINA WIJAYA" in detail["clean_text"]

    screening = client.get(f"{API}/applications/{app_id}/screening", headers=hr).json
    reqs = {r["requirement"]: r for r in screening["requirements"]}
    assert reqs["scikit-learn"]["status"] == "matched" and reqs["scikit-learn"]["matched_by"] == "normalized"
    assert reqs["Spark"]["status"] == "not_found"
    assert 0 <= screening["overall_score"] <= 100

    application = client.get(f"{API}/applications/{app_id}", headers=hr).json
    assert application["stage"] == "screening" and application["candidate_name"] == "Rina Wijaya"
    assert application["stage_history"][-1]["to_stage"] == "screening"

    # Re-running with identical inputs returns the same result; force creates a new one.
    again = client.post(f"{API}/applications/{app_id}/screening", json={}, headers=hr).json
    assert again["id"] == screening["id"]
    forced = client.post(f"{API}/applications/{app_id}/screening", json={"force": True}, headers=hr).json
    assert forced["id"] != screening["id"]


def test_duplicate_upload_is_not_reprocessed(client, hr, job):
    res = upload(client, hr, job["id"], "budi")
    app_id = res.json["application"]["id"]
    name, data = sample_bytes("budi")
    again = client.post(f"{API}/applications/{app_id}/documents", headers=hr,
                        data={"file": (io.BytesIO(data), name)}, content_type="multipart/form-data")
    assert again.status_code == 200 and again.json["id"] == res.json["document"]["id"]


def test_invalid_upload_rolls_back(client, hr, job):
    res = client.post(f"{API}/candidates/upload", headers=hr,
                      data={"job_id": str(job["id"]), "file": (io.BytesIO(b"hello world"), "cv.txt")},
                      content_type="multipart/form-data")
    assert res.status_code == 400 and res.json["error"]["code"] == "unsupported_type"
    assert client.get(f"{API}/candidates", headers=hr).json["total"] == 0


def test_corrections_are_stored_separately(client, hr, job):
    res = upload(client, hr, job["id"], "rina")
    cid, app_id = res.json["candidate"]["id"], res.json["application"]["id"]
    doc_id = res.json["document"]["id"]
    patch = client.patch(f"{API}/candidates/{cid}/corrections", headers=hr,
                         json={"skills_add": ["Apache Spark"], "skills_remove": ["Tableau"], "full_name": "Rina W. Wijaya"})
    assert patch.status_code == 200
    body = patch.json
    assert body["full_name"] == "Rina W. Wijaya"
    names = {s["name"]: s["source"] for s in body["skills"]}
    assert names["Apache Spark"] == "hr" and "Tableau" not in names
    # AI extraction itself is untouched.
    with client.application.app_context():
        doc = db.session.get(Document, doc_id)
        assert doc.extraction["name"]["value"] == "Rina Wijaya"
        assert any(s["normalized"] == "Tableau" for s in doc.extraction["skills"])
    # Re-screening picks up the correction (different inputs -> new result).
    new = client.post(f"{API}/applications/{app_id}/screening", json={}, headers=hr).json
    spark = next(r for r in new["requirements"] if r["requirement"] == "Spark")
    assert spark["status"] == "matched" and spark["explanation"] == "Added by HR correction."
    # Search by skill (including HR-added skills).
    assert client.get(f"{API}/candidates?q=spark", headers=hr).json["total"] == 1
    assert client.get(f"{API}/candidates?q=pytorch", headers=hr).json["total"] == 1
    assert client.get(f"{API}/candidates?q=cobol", headers=hr).json["total"] == 0


def test_reviews_and_stage_changes(client, hr, job):
    res = upload(client, hr, job["id"], "rina")
    app_id = res.json["application"]["id"]
    screening = client.get(f"{API}/applications/{app_id}/screening", headers=hr).json
    key = next(r["key"] for r in screening["requirements"] if r["status"] == "matched")
    bad = client.post(f"{API}/applications/{app_id}/reviews", headers=hr,
                      json={"evidence_validations": {"bogus:key": "confirmed"}})
    assert bad.status_code == 400
    review = client.post(f"{API}/applications/{app_id}/reviews", headers=hr, json={
        "notes": "Verified.", "recommendation": "advance", "evidence_validations": {key: "confirmed"},
        "new_stage": "shortlisted"})
    assert review.status_code == 201
    updated = client.get(f"{API}/applications/{app_id}/screening", headers=hr).json
    assert next(r for r in updated["requirements"] if r["key"] == key)["hr_validation"] == "confirmed"
    assert updated["id"] == screening["id"]  # AI result itself unchanged
    assert client.get(f"{API}/applications/{app_id}", headers=hr).json["stage"] == "shortlisted"
    with client.application.app_context():
        assert AuditLog.query.filter_by(action="application.reviewed").count() == 1


def test_system_status(client, hr):
    status = client.get(f"{API}/system/status", headers=hr).json
    assert status["database"] == "ok" and status["llm"]["enabled"] is False
    assert client.get(f"{API}/analytics/overview", headers=hr).status_code == 404


def test_swagger_documents_the_api(client):
    spec = client.get(f"{API}/swagger.json").json
    paths = spec["paths"]
    for path in ("/jobs", "/candidates/upload", "/applications/{application_id}/screening",
                 "/interviews/{session_id}/evaluation", "/candidate-interview/messages", "/analytics/dashboard"):
        assert path in paths, path
    assert "Bearer" not in spec.get("securityDefinitions", {})  # no HR auth scheme / login
    assert not any("/auth" in p or p.startswith("/users") for p in paths)
    assert all("security" not in op for path, item in paths.items() if not path.startswith("/candidate-interview")
               for op in item.values() if isinstance(op, dict))
    assert client.get(f"{API}/docs").status_code == 200
    short = client.get("/docs", follow_redirects=True)
    assert short.status_code == 200 and b"swagger" in short.data.lower()


def test_cv_files_not_served_statically(client, hr, job):
    upload(client, hr, job["id"], "rina")
    assert client.get("/storage/documents/").status_code == 404


def test_job_delete_rules(client, hr, job):
    # Empty job: hr can delete it, including its form and interview templates.
    empty = client.post(f"{API}/jobs", json={**JOB_PAYLOAD, "title": "Temp role"}, headers=hr).json
    client.post(f"{API}/jobs/{empty['id']}/form", headers=hr)
    suggestion = client.post(f"{API}/interview-templates/suggest", json={"job_id": empty["id"]}, headers=hr).json
    client.post(f"{API}/interview-templates", json=suggestion, headers=hr)
    assert client.delete(f"{API}/jobs/{empty['id']}", headers=hr).status_code == 204
    assert client.get(f"{API}/jobs/{empty['id']}", headers=hr).status_code == 404
    assert client.get(f"{API}/interview-templates?job_id={empty['id']}", headers=hr).json == []

    # Job with applications is protected; force=true deletes it, candidates are kept.
    res = upload(client, hr, job["id"], "rina")
    cid = res.json["candidate"]["id"]
    blocked = client.delete(f"{API}/jobs/{job['id']}", headers=hr)
    assert blocked.status_code == 409 and blocked.json["error"]["code"] == "job_has_applications"
    assert client.delete(f"{API}/jobs/{job['id']}?force=true", headers=hr).status_code == 204
    assert client.get(f"{API}/jobs/{job['id']}", headers=hr).status_code == 404
    cand = client.get(f"{API}/candidates/{cid}", headers=hr).json
    assert cand["applications"] == [] and cand["full_name"] == "Rina Wijaya"


def test_scoring_weights_settings(client, hr, job):
    res = upload(client, hr, job["id"], "rina")
    app_id = res.json["application"]["id"]
    before = client.get(f"{API}/applications/{app_id}/screening", headers=hr).json

    current = client.get(f"{API}/settings/scoring-weights", headers=hr).json
    assert [r["label"] for r in current["items"]][:2] == ["Skill wajib", "Skill tambahan"]
    assert [r["no"] for r in current["items"]] == [1, 2, 3, 4, 5, 6, 7]
    assert current["items"][-1]["label"] == "Screening questions"
    assert current["total"] == 100 and current["is_default"] and current["affected_applications"] == 1

    new = {"required_skills": 50, "preferred_skills": 10, "experience": 25, "education": 10, "certifications": 5,
           "semantic": 0}
    bad = client.put(f"{API}/settings/scoring-weights", json={"weights": {**new, "semantic": 10}}, headers=hr)
    assert bad.status_code == 400 and bad.json["error"]["code"] == "weights_total_not_100"
    bad = client.put(f"{API}/settings/scoring-weights", json={"weights": {**new, "experience": -5, "semantic": 30}},
                     headers=hr)
    assert bad.status_code == 400 and "experience" in bad.json["error"]["details"]["fields"]

    saved = client.put(f"{API}/settings/scoring-weights", json={"weights": new}, headers=hr).json
    assert saved["is_default"] is False and saved["updated_by"] and saved["rescreen_queued"] == 1
    # Every job now reports the organisation weights, and open jobs' applications were re-scored.
    assert client.get(f"{API}/jobs/{job['id']}", headers=hr).json["weights"] == {
        **{k: float(v) for k, v in new.items()}, "screening_questions": 0.0}
    after = client.get(f"{API}/applications/{app_id}/screening", headers=hr).json
    assert after["id"] != before["id"]
    comps = {c["component"]: c for c in after["components"]}
    assert comps["required_skills"]["weight"] == 50 and comps["semantic"]["effective_weight"] == 0
    with client.application.app_context():
        assert AuditLog.query.filter_by(action="settings.scoring_weights_updated").count() == 1


def test_applications_list_search_sort_and_summary(client, hr, job):
    upload(client, hr, job["id"], "dewi")
    upload(client, hr, job["id"], "rina")
    items = client.get(f"{API}/applications?job_id={job['id']}&sort=score", headers=hr).json["items"]
    scores = [a["match_score"] for a in items]
    assert scores == sorted(scores, reverse=True) and items[0]["candidate_name"] == "Rina Wijaya"
    summary = items[0]["screening_summary"]
    assert summary["required_total"] == 5 and summary["required_matched"] >= 4
    assert summary["screening_total"] == 0 and summary["knockout_failed"] is False
    found = client.get(f"{API}/applications?q=dewi", headers=hr).json
    assert found["total"] == 1 and found["items"][0]["candidate_name"] == "Dewi Lestari"
