"""Interview configuration, CV-based questions, shortlist + bulk email invitations, candidate flow, evaluation."""

from datetime import datetime, timedelta, timezone

from app.extensions import db
from app.llm.adapter import set_llm
from app.models import EmailLog, InterviewSession
from tests.conftest import upload
from tests.test_nlp import FakeLLM

API = "/api/v1/talent"
LONG = ("Di proyek terakhir saya membangun model forecasting dengan Python dan SQL. Saya merancang fitur, memvalidasi "
        "dengan time split dan men-deploy dengan Docker, hasilnya stock-out turun 18 persen dalam dua kuartal.")


def setup_interview(client, hr, job, approve=True, prefix="rina", num_questions=2):
    app_id = upload(client, hr, job["id"], prefix).json["application"]["id"]
    suggestion = client.post(f"{API}/interview-templates/suggest", json={"job_id": job["id"]}, headers=hr).json
    assert suggestion["language"] == "id" and suggestion["cv_questions"] == 2
    suggestion["num_questions"] = num_questions
    template = client.post(f"{API}/interview-templates", json=suggestion, headers=hr)
    assert template.status_code == 201, template.json
    tid = template.json["id"]
    if approve:
        assert client.post(f"{API}/interview-templates/{tid}/approve", headers=hr).json["status"] == "approved"
    return app_id, tid


def invite(client, hr, app_id, tid, send_email=False):
    res = client.post(f"{API}/applications/{app_id}/interviews", json={"template_id": tid, "send_email": send_email},
                      headers=hr)
    assert res.status_code == 201, res.json
    token = res.json["invitation_url"].split("#", 1)[1]
    return res.json["session"]["id"], {"X-Interview-Token": token}, token


def answer_all(client, headers, text=LONG, mode="voice"):
    for _ in range(20):
        state = client.post(f"{API}/candidate-interview/messages", json={"content": text, "input_mode": mode},
                            headers=headers).json
        if state["status"] != "in_progress":
            return state
    raise AssertionError("interview did not finish")


def test_template_validation_and_approval_required(client, hr, job):
    app_id, tid = setup_interview(client, hr, job, approve=False)
    bad = client.post(f"{API}/interview-templates", headers=hr, json={
        "job_id": job["id"], "name": "x", "competencies": [{"name": "A", "description": "", "weight": 1,
                                                           "rubric": [{"score": 1, "descriptor": "x"}]}],
        "questions": [{"id": "q1", "competency": "A", "text": "?"}]})
    assert bad.status_code == 400 and "rubric" in bad.json["error"]["message"]
    res = client.post(f"{API}/applications/{app_id}/interviews", json={"template_id": tid}, headers=hr)
    assert res.status_code == 409 and res.json["error"]["code"] == "template_not_approved"
    client.post(f"{API}/interview-templates/{tid}/approve", headers=hr)
    edited = client.patch(f"{API}/interview-templates/{tid}", json={"duration_minutes": 20, "cv_questions": 3},
                          headers=hr).json
    assert edited["status"] == "draft" and edited["cv_questions"] == 3  # edits require re-approval
    assert client.patch(f"{API}/interview-templates/{tid}", json={"language": "fr"}, headers=hr).status_code == 400


def test_cv_questions_are_personalised_and_grounded(client, hr, job):
    app_id, tid = setup_interview(client, hr, job)
    sid, _, _ = invite(client, hr, app_id, tid)
    session = client.get(f"{API}/interviews/{sid}", headers=hr).json
    assert session["language"] == "id" and session["questions_total"] == 4  # 2 from CV + 2 from template
    cv_qs = [q for q in session["questions"] if q["source"] == "cv"]
    assert len(cv_qs) == 2 and cv_qs == session["questions"][:2]  # asked first
    assert "Senior Data Scientist" in cv_qs[0]["text"] and "PT Nusantara Digital Commerce" in cv_qs[0]["text"]
    detail = client.get(f"{API}/documents/{client.get(f'{API}/applications/{app_id}', headers=hr).json['latest_document']['id']}",
                        headers=hr).json
    lines = detail["clean_text"].split("\n")
    for q in cv_qs:
        if q["cv_basis_line"]:
            assert lines[q["cv_basis_line"] - 1] == q["cv_basis"]


def test_full_candidate_flow_in_indonesian(client, hr, job):
    app_id, tid = setup_interview(client, hr, job)
    sid, headers, token = invite(client, hr, app_id, tid)
    with client.application.app_context():
        session = db.session.get(InterviewSession, sid)
        assert session.token_hash != token and len(session.token_hash) == 64  # only the hash is stored

    state = client.get(f"{API}/candidate-interview", headers=headers).json
    assert state["status"] == "pending" and state["language"] == "id" and state["speech_lang"] == "id-ID"
    assert "tidak direkam" in state["privacy_notice"] and state["current_question"] is None
    assert "overall_score" not in str(state)
    assert client.post(f"{API}/candidate-interview/messages", json={"content": "hi"}, headers=headers).status_code == 409
    assert client.post(f"{API}/candidate-interview/start", json={"consent": False}, headers=headers).status_code == 400

    state = client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers).json
    assert state["status"] == "in_progress" and state["messages"][0]["content"].startswith("Halo Rina")
    assert state["current_question"]["index"] == 1 and state["current_question"]["total"] == 4

    # A very short answer triggers one follow-up in Indonesian (rule-based, no LLM configured).
    state = client.post(f"{API}/candidate-interview/messages", json={"content": "Saya pakai Python.", "input_mode": "voice"},
                        headers=headers).json
    assert "lebih spesifik" in state["current_question"]["text"] and state["current_question"]["is_follow_up"]
    state = client.post(f"{API}/candidate-interview/messages", json={"content": LONG, "input_mode": "text"}, headers=headers).json
    assert state["current_question"]["index"] == 2 and "Pertanyaan berikutnya (2 dari 4)" in state["current_question"]["text"]
    state = answer_all(client, headers)
    assert state["status"] == "completed"
    assert client.post(f"{API}/candidate-interview/messages", json={"content": LONG}, headers=headers).status_code == 409

    session = client.get(f"{API}/interviews/{sid}", headers=hr).json
    assert session["status"] == "completed" and session["questions_answered"] == 4
    modes = [m["input_mode"] for m in session["messages"] if m["role"] == "candidate"]
    assert modes[:2] == ["voice", "text"]
    evaluation = client.get(f"{API}/interviews/{sid}/evaluation", headers=hr).json
    # Without an LLM: evidence only, no invented scores, flagged for HR, texts in Indonesian.
    assert evaluation["status"] == "needs_review" and evaluation["method"] == "rule-based-evidence-only"
    assert evaluation["overall_score"] is None and "Penilaian rubrik otomatis" in evaluation["overall_summary"]
    comps = {c["competency"]: c for c in evaluation["competencies"]}
    assert "Pendalaman Pengalaman CV" in comps and comps["Pendalaman Pengalaman CV"]["evidence"]


def test_concrete_answer_gets_no_follow_up(client, hr, job):
    app_id, tid = setup_interview(client, hr, job)
    _, headers, _ = invite(client, hr, app_id, tid)
    client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers)
    state = client.post(f"{API}/candidate-interview/messages", json={"content": LONG}, headers=headers).json
    assert not state["current_question"]["is_follow_up"] and state["current_question"]["index"] == 2


def test_shortlist_and_bulk_invite_with_email(client, hr, job, monkeypatch):
    for prefix in ("rina", "dewi", "budi"):
        upload(client, hr, job["id"], prefix)
    ranked = client.get(f"{API}/jobs/{job['id']}/applications?sort=score", headers=hr).json["items"]
    res = client.post(f"{API}/jobs/{job['id']}/shortlist", json={"top_n": 2}, headers=hr).json
    assert [a["id"] for a in res["items"]] == [a["id"] for a in ranked[:2]]
    assert all(a["stage"] == "shortlisted" and a["stage_history"][-1]["to_stage"] == "shortlisted" for a in res["items"])

    suggestion = client.post(f"{API}/interview-templates/suggest", json={"job_id": job["id"]}, headers=hr).json
    tid = client.post(f"{API}/interview-templates", json=suggestion, headers=hr).json["id"]
    client.post(f"{API}/interview-templates/{tid}/approve", headers=hr)

    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def starttls(self, context=None):
            pass

        def login(self, user, password):
            pass

        def send_message(self, msg):
            sent.append(msg)

    monkeypatch.setitem(client.application.config, "SMTP_HOST", "smtp.test.local")
    monkeypatch.setitem(client.application.config, "MAIL_FROM", "hr@xorca.local")
    monkeypatch.setattr("app.services.mailer.smtplib.SMTP", FakeSMTP)
    shortlisted = [a["id"] for a in res["items"]]
    out = client.post(f"{API}/jobs/{job['id']}/interviews/bulk-invite", headers=hr,
                      json={"template_id": tid, "application_ids": shortlisted}).json
    assert out["invited"] == 2 and out["emailed"] == 2 and out["smtp_configured"]
    assert len(sent) == 2 and "Undangan AI Interview" in sent[0]["Subject"]
    body = sent[0].get_body(("plain",)).get_content()
    token = next(r for r in out["results"] if r["email"] == sent[0]["To"])["invitation_url"].split("#")[1]
    assert token in body
    with client.application.app_context():
        logs = EmailLog.query.all()
        assert len(logs) == 2 and all(token not in log.body_redacted for log in logs)  # token never stored
    # Second run skips candidates who already have an active invitation.
    again = client.post(f"{API}/jobs/{job['id']}/interviews/bulk-invite", headers=hr,
                        json={"template_id": tid, "application_ids": shortlisted}).json
    assert again["invited"] == 0 and all(r["status"] == "skipped" for r in again["results"])
    session = client.get(f"{API}/interviews/{out['results'][0]['session_id']}", headers=hr).json
    assert session["invitation_email"]["status"] == "sent"


def test_bulk_invite_without_smtp_returns_links(client, hr, job):
    app_id, tid = setup_interview(client, hr, job)
    out = client.post(f"{API}/jobs/{job['id']}/interviews/bulk-invite", headers=hr,
                      json={"template_id": tid, "application_ids": [app_id, 999999]}).json
    assert out["smtp_configured"] is False and out["invited"] == 1
    invited = next(r for r in out["results"] if r["status"] == "invited")
    assert invited["email_status"] == "not_configured" and "/interview#" in invited["invitation_url"]
    assert next(r for r in out["results"] if r["application_id"] == 999999)["status"] == "skipped"


def test_invalid_revoked_and_expired_tokens(client, hr, job):
    app_id, tid = setup_interview(client, hr, job)
    assert client.get(f"{API}/candidate-interview", headers={"X-Interview-Token": "nope"}).status_code == 401
    assert client.get(f"{API}/candidate-interview").status_code == 401
    sid, headers, _ = invite(client, hr, app_id, tid)
    client.post(f"{API}/interviews/{sid}/revoke", headers=hr)
    res = client.get(f"{API}/candidate-interview", headers=headers)
    assert res.status_code == 410 and res.json["error"]["code"] == "revoked"

    sid2, headers2, _ = invite(client, hr, app_id, tid)
    with client.application.app_context():
        s = db.session.get(InterviewSession, sid2)
        s.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.session.commit()
    res = client.get(f"{API}/candidate-interview", headers=headers2)
    assert res.status_code == 410 and res.json["error"]["code"] == "expired"
    assert client.get(f"{API}/interviews/{sid2}", headers=hr).json["status"] == "expired"


def test_llm_evaluation_withholds_scores_without_verified_evidence(client, hr, job):
    app_id, tid = setup_interview(client, hr, job, num_questions=1)
    sid, headers, _ = invite(client, hr, app_id, tid)
    client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers)
    comps = [c["competency"] for c in client.get(f"{API}/interviews/{sid}", headers=hr).json["questions"]]

    class EvalLLM(FakeLLM):
        def generate_json(self, *, system, prompt, schema, max_tokens=8000, effort="low", **_):
            if schema.__name__ == "_FollowUpDecision":
                return schema.model_validate({"needs_follow_up": False, "follow_up_question": None})
            return schema.model_validate({
                "competencies": [
                    {"competency": comps[0], "score": 4, "evidence": [{"quote": "stock-out turun 18 persen"}],
                     "strengths": ["Dampak terukur"], "gaps": []},
                    {"competency": comps[-1], "score": 5, "evidence": [{"quote": "saya memimpin tim 50 orang"}],
                     "strengths": ["Kepemimpinan"], "gaps": []},
                ],
                "overall_summary": "Contoh teknis yang kuat.", "unanswered_areas": [],
            })

    set_llm(EvalLLM())
    answer_all(client, headers)
    evaluation = client.get(f"{API}/interviews/{sid}/evaluation", headers=hr).json
    by = {c["competency"]: c for c in evaluation["competencies"]}
    assert by[comps[0]]["score"] == 4 and by[comps[0]]["evidence"][0]["message_id"]
    # The quote for the last competency is not in the transcript, so its score is withheld.
    assert by[comps[-1]]["score"] is None and by[comps[-1]]["insufficient_evidence"]
    assert evaluation["status"] == "needs_review" and evaluation["method"] == "llm:fake-model"


def test_evidence_quote_cleanup_and_matching():
    from app.services.interviews import _clean_quote, _norm

    raw = '[CANDIDATE / Kesadaran Diri] "Kelebihan saya teliti dan bisa menjelaskan ke tim non‑teknis."'
    quote = _clean_quote(raw)
    assert quote == "Kelebihan saya teliti dan bisa menjelaskan ke tim non‑teknis."
    answer = "Kelebihan saya teliti dan bisa menjelaskan ke tim non-teknis. Kekurangan saya ..."
    assert _norm(quote).rstrip(".") in _norm(answer)
