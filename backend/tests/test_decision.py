"""Final HR hiring decision (accepted / rejected) after the AI interview."""

from app.extensions import db
from app.models import Application, AuditLog, InterviewSession, Job
from app.services import auto_invite
from tests.test_interviews import API, invite, setup_interview


def completed_interview(client, hr, job, prefix="rina"):
    app_id, tid = setup_interview(client, hr, job, prefix=prefix)
    sid, headers, _ = invite(client, hr, app_id, tid)
    assert client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers).status_code == 200
    assert client.post(f"{API}/interviews/{sid}/complete", headers=hr).status_code == 200
    return app_id, tid, sid


def decide(client, headers, app_id, decision, note=None):
    body = {"decision": decision} | ({"note": note} if note is not None else {})
    return client.post(f"{API}/applications/{app_id}/decision", json=body, headers=headers)


def test_accept_moves_to_hired_with_history_and_audit(client, hr, job):
    app_id, tid, sid = completed_interview(client, hr, job)
    # A pending re-invitation is revoked by the decision.
    pending_sid = invite(client, hr, app_id, tid)[0]
    # The central system names the person acting via X-Actor-Name (attribution only).
    res = decide(client, {**hr, "X-Actor-Name": "Dewi Manajer HR"}, app_id, "accepted", "Strong interview.")
    assert res.status_code == 200, res.json
    data = res.json
    assert data["stage"] == "hired" and data["decision"] == "accepted"
    assert data["decision_note"] == "Strong interview." and data["decided_by"] == "Dewi Manajer HR" and data["decided_at"]
    last = data["stage_history"][-1]
    assert last["from_stage"] == "interview" and last["to_stage"] == "hired"
    assert last["changed_by"] == "Dewi Manajer HR" and last["note"] == "HR decision: Accepted — Strong interview."
    with client.application.app_context():
        entry = AuditLog.query.filter_by(action="application.decision").one()
        assert entry.actor_label == "Dewi Manajer HR"
        assert entry.details["decision"] == "accepted" and entry.details["revoked_sessions"] == [pending_sid]
        assert db.session.get(InterviewSession, pending_sid).status == "revoked"
        assert db.session.get(InterviewSession, sid).status == "completed"
    session = client.get(f"{API}/interviews/{sid}", headers=hr).json
    assert session["application_stage"] == "hired" and session["application_decision"] == "accepted"
    assert session["application_has_completed_interview"] is True


def test_reject_moves_to_rejected_and_is_final(client, hr, job):
    app_id, tid, _ = completed_interview(client, hr, job)
    res = decide(client, hr, app_id, "rejected")
    assert res.status_code == 200, res.json
    assert res.json["stage"] == "rejected" and res.json["decision"] == "rejected" and res.json["decision_note"] is None
    assert res.json["stage_history"][-1]["note"] == "HR decision: Rejected"
    again = decide(client, hr, app_id, "accepted")
    assert again.status_code == 409 and again.json["error"]["code"] == "already_decided"
    # Stage can't be changed through the legacy PATCH either, and no new invitations.
    patch = client.patch(f"{API}/applications/{app_id}", json={"stage": "interview"}, headers=hr)
    assert patch.status_code == 409 and patch.json["error"]["code"] == "already_decided"
    res = client.post(f"{API}/applications/{app_id}/interviews", json={"template_id": tid}, headers=hr)
    assert res.status_code == 409 and res.json["error"]["code"] == "already_decided"


def test_default_actor_is_hr_without_header(client, hr, job):
    app_id, _, _ = completed_interview(client, hr, job)
    res = decide(client, hr, app_id, "accepted")
    assert res.status_code == 200, res.json
    assert res.json["decided_by"] == "HR" and res.json["stage_history"][-1]["changed_by"] == "HR"
    with client.application.app_context():
        assert AuditLog.query.filter_by(action="application.decision").one().actor_label == "HR"


def test_requires_completed_interview(client, hr, job):
    app_id, tid = setup_interview(client, hr, job)
    res = decide(client, hr, app_id, "accepted")  # not invited yet
    assert res.status_code == 409 and res.json["error"]["code"] == "interview_not_completed"
    invite(client, hr, app_id, tid)  # stage interview, but not completed
    res = decide(client, hr, app_id, "rejected")
    assert res.status_code == 409 and res.json["error"]["code"] == "interview_not_completed"
    detail = client.get(f"{API}/applications/{app_id}", headers=hr).json
    assert detail["decision"] is None and detail["has_completed_interview"] is False


def test_invalid_decision_is_400(client, hr, job):
    app_id, _, _ = completed_interview(client, hr, job)
    assert decide(client, hr, app_id, "maybe").status_code == 400
    assert decide(client, hr, app_id, "accepted", "x" * 2001).status_code == 400
    assert client.post(f"{API}/applications/{app_id}/decision", json={}, headers=hr).status_code == 400


def test_auto_invite_skips_decided_applications(client, hr, job):
    app_id, _, _ = completed_interview(client, hr, job)
    assert decide(client, hr, app_id, "rejected").status_code == 200
    with client.application.app_context():
        selected, skipped = auto_invite.select(db.session.get(Job, job["id"]))
        assert app_id not in [a.id for a in selected] and sum(skipped.values()) == 0
