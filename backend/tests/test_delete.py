"""Permanent deletion of candidates and applications (right to erasure)."""

from pathlib import Path

from flask import current_app
from sqlalchemy import func, select

from app.extensions import db
from app.models import (Application, AuditLog, Candidate, Document, EmailLog, HRReview, InterviewEvaluation,
                        InterviewMessage, InterviewSession, ScreeningResult, StageHistory)
from tests.conftest import JOB_PAYLOAD, upload
from tests.test_interviews import answer_all, invite, setup_interview

API = "/api/v1/talent"


def _count(model, *where) -> int:
    return db.session.scalar(select(func.count()).select_from(model).where(*where))


def _stored(key: str) -> bool:
    return (Path(current_app.config["DOCUMENT_STORAGE_DIR"]) / key).exists()


def _candidate_with_everything(client, hr, job):
    """Rina: two applications, a completed + evaluated interview (with email), a review and stage changes."""
    app_id, tid = setup_interview(client, hr, job)
    _, headers, _ = invite(client, hr, app_id, tid, send_email=True)
    client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers)
    answer_all(client, headers)
    client.post(f"{API}/applications/{app_id}/reviews", json={"notes": "Good", "recommendation": "advance",
                                                               "new_stage": "shortlisted"}, headers=hr)
    cid = client.get(f"{API}/applications/{app_id}", headers=hr).json["candidate_id"]
    job2 = client.post(f"{API}/jobs", json={**JOB_PAYLOAD, "title": "ML Engineer"}, headers=hr).json
    app2 = client.post(f"{API}/applications", json={"candidate_id": cid, "job_id": job2["id"]}, headers=hr)
    assert app2.status_code == 201, app2.json
    return cid, app_id, app2.json["id"], job2


def test_delete_candidate_removes_everything(app, client, hr, job):
    cid, app_id, _, job2 = _candidate_with_everything(client, hr, job)
    other = upload(client, hr, job["id"], "budi").json
    other_cid = other["candidate"]["id"]
    with app.app_context():
        keys = list(db.session.scalars(select(Document.storage_key).where(Document.candidate_id == cid)))
        other_keys = list(db.session.scalars(select(Document.storage_key).where(Document.candidate_id == other_cid)))
        assert keys and all(_stored(k) for k in keys)
        assert _count(InterviewMessage) and _count(InterviewEvaluation) and _count(EmailLog) and _count(HRReview)
    assert client.get(f"{API}/jobs/{job['id']}", headers=hr).json["candidate_count"] == 2

    assert client.delete(f"{API}/candidates/{cid}", headers=hr).status_code == 204
    assert client.get(f"{API}/candidates/{cid}", headers=hr).status_code == 404
    assert client.delete(f"{API}/candidates/{cid}", headers=hr).status_code == 404
    assert client.get(f"{API}/jobs/{job['id']}", headers=hr).json["candidate_count"] == 1
    assert client.get(f"{API}/jobs/{job2['id']}", headers=hr).json["candidate_count"] == 0

    with app.app_context():
        assert db.session.get(Candidate, cid) is None
        assert _count(Application, Application.candidate_id == cid) == 0
        assert _count(Document, Document.candidate_id == cid) == 0
        assert _count(ScreeningResult, ScreeningResult.application_id == app_id) == 0
        assert _count(HRReview) == 0 and _count(StageHistory, StageHistory.application_id == app_id) == 0
        assert _count(InterviewSession) == 0 and _count(InterviewMessage) == 0 and _count(InterviewEvaluation) == 0
        assert _count(EmailLog) == 0
        assert not any(_stored(k) for k in keys)
        # The other candidate is untouched.
        assert db.session.get(Candidate, other_cid) is not None
        assert all(_stored(k) for k in other_keys)
        entry = AuditLog.query.filter_by(action="candidate.deleted").one()
        assert entry.entity_id == cid
        assert entry.details == {"candidate_id": cid, "applications": 2, "documents": len(keys),
                                 "interview_sessions": 1}
        assert "Rina" not in str(entry.details)


def test_delete_application_keeps_candidate_until_last(app, client, hr, job):
    cid, app_id, app2_id, _ = _candidate_with_everything(client, hr, job)
    assert client.delete(f"{API}/applications/999999", headers=hr).status_code == 404
    assert client.delete(f"{API}/applications/{app_id}", headers=hr).status_code == 204
    cand = client.get(f"{API}/candidates/{cid}", headers=hr).json
    assert [a["id"] for a in cand["applications"]] == [app2_id]
    with app.app_context():
        assert _count(InterviewSession) == 0 and _count(EmailLog) == 0 and _count(Document) == 0
        assert AuditLog.query.filter_by(action="application.deleted").one().details["candidate_deleted"] is False

    assert client.delete(f"{API}/applications/{app2_id}", headers=hr).status_code == 204
    assert client.get(f"{API}/candidates/{cid}", headers=hr).status_code == 404
    with app.app_context():
        assert db.session.get(Candidate, cid) is None


def test_delete_with_interview_in_progress(client, hr, job):
    app_id, tid = setup_interview(client, hr, job)
    _, headers, _ = invite(client, hr, app_id, tid)
    assert client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers).status_code == 200
    cid = client.get(f"{API}/applications/{app_id}", headers=hr).json["candidate_id"]
    assert client.delete(f"{API}/candidates/{cid}", headers=hr).status_code == 204
    for res in (client.get(f"{API}/candidate-interview", headers=headers),
                client.post(f"{API}/candidate-interview/messages", json={"content": "Halo"}, headers=headers),
                client.get(f"{API}/candidate-interview/messages/1/audio", headers=headers)):
        assert res.status_code in (401, 404, 410), res.status_code
