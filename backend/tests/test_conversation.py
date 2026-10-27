"""Conversational interview mode: turn plan, personalisation, prompt budget, guardrails, fallbacks, time cap."""

import re
import time
from datetime import timedelta

import pytest

from app.extensions import db
from app.llm.adapter import LLMAdapter, LLMError, set_llm
from app.models import InterviewMessage, InterviewSession
from app.services import conversation, tts
from tests.conftest import upload
from tests.test_interviews import API, LONG, invite
from tests.test_tts import FakeProvider

SHORT = "Saya suka bekerja."

# Suggested library template: Kemampuan Teknis 35, Komunikasi 15, Pemecahan Masalah 25, Kerja Sama Tim 25.
CORE_ORDER = ["Kemampuan Teknis", "Pemecahan Masalah", "Kerja Sama Tim"]


class ConversationLLM(LLMAdapter):
    """Fake provider: answers per turn kind (parsed from the TASK line) and records every prompt."""

    provider, model = "fake", "fake-model"

    def __init__(self, reply=None, error=None, delay=0.0):
        self.calls: list[dict] = []
        self.reply, self.error, self.delay = reply, error, delay

    @property
    def enabled(self):
        return True

    def describe(self):
        return "fake-model"

    def generate_json(self, *, system, prompt, schema, max_tokens=8000, effort="low", temperature=None):
        if "TASK:" not in prompt:  # not a conversation turn (CV extraction, template suggestion, evaluation)
            raise LLMError("disabled", "fake provider only plays the interviewer")
        self.calls.append({"system": system, "prompt": prompt, "max_tokens": max_tokens, "temperature": temperature})
        if self.delay:
            time.sleep(self.delay)
        if self.error:
            raise self.error
        task = prompt.rsplit("TASK:", 1)[1]
        kind = "closing" if task.startswith(" Closing") else "follow_up" if task.startswith(" Follow-up") else "question"
        m = re.search(r"competency=([^)]+)\)", task)
        text = self.reply(task) if self.reply else {
            "question": f"Menarik sekali. Bisa ceritakan pengalaman Anda soal {m.group(1) if m else 'posisi ini'}?",
            "follow_up": "Bisa beri satu contoh konkret beserta hasilnya?",
            "closing": "Terima kasih atas waktunya. Tim rekrutmen akan menghubungi Anda untuk tahap selanjutnya.",
        }[kind]
        return schema.model_validate({"kind": kind, "competency": m.group(1) if m else None, "text": text})


def conversational_template(client, hr, job, prefix="rina", **overrides):
    app_id = upload(client, hr, job["id"], prefix).json["application"]["id"]
    suggestion = client.post(f"{API}/interview-templates/suggest", json={"job_id": job["id"]}, headers=hr).json
    payload = {**suggestion, "mode": "conversational", "num_questions": 5, "duration_minutes": 7, **overrides}
    res = client.post(f"{API}/interview-templates", json=payload, headers=hr)
    assert res.status_code == 201, res.json
    tid = res.json["id"]
    assert client.post(f"{API}/interview-templates/{tid}/approve", headers=hr).json["status"] == "approved"
    return app_id, tid


def start(client, headers):
    state = client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers).json
    assert state["status"] == "in_progress", state
    return state


def say(client, headers, text=LONG):
    res = client.post(f"{API}/candidate-interview/messages", json={"content": text, "input_mode": "voice"},
                      headers=headers)
    assert res.status_code == 200, res.json
    return res.json


def assistant_messages(app, sid):
    with app.app_context():
        return [(m.content, m.competency, m.question_id, m.is_follow_up, m.mode_used)
                for m in InterviewMessage.query.filter_by(session_id=sid, role="assistant").order_by(InterviewMessage.id)]


# ---------------------------------------------------------------- template validation


def test_template_validation_for_mode(client, hr, job):
    suggestion = client.post(f"{API}/interview-templates/suggest", json={"job_id": job["id"]}, headers=hr).json
    assert suggestion["mode"] == "template"

    def create(**kw):
        return client.post(f"{API}/interview-templates", json={**suggestion, **kw}, headers=hr)

    assert create(mode="chatty").status_code == 400
    assert create(mode="conversational", num_questions=6).status_code == 400
    assert create(mode="conversational", num_questions=3).status_code == 400
    assert create(mode="conversational", num_questions=5, duration_minutes=15).status_code == 400
    # Guidance questions are optional; defaults are 5 questions / 7 minutes.
    ok = create(mode="conversational", questions=[], num_questions=None, duration_minutes=None)
    assert ok.status_code == 201, ok.json
    assert (ok.json["mode"], ok.json["num_questions"], ok.json["duration_minutes"], ok.json["questions"]) == \
        ("conversational", 5, 7, [])
    # Competencies + rubrics stay mandatory.
    assert create(mode="conversational", competencies=[]).status_code == 400
    # Template mode is unchanged: questions still required.
    assert create(mode="template", questions=[]).status_code == 400
    # PATCH can switch an approved template; it returns to draft.
    tid = create().json["id"]
    client.post(f"{API}/interview-templates/{tid}/approve", headers=hr)
    patched = client.patch(f"{API}/interview-templates/{tid}", headers=hr,
                           json={"mode": "conversational", "num_questions": 4, "duration_minutes": 6}).json
    assert patched["mode"] == "conversational" and patched["status"] == "draft" and patched["num_questions"] == 4


# ---------------------------------------------------------------- the conversation


def test_turn_plan_order_competencies_and_completion(client, hr, job, app):
    llm = ConversationLLM()
    set_llm(llm)
    app_id, tid = conversational_template(client, hr, job)
    sid, headers, _ = invite(client, hr, app_id, tid)

    session = client.get(f"{API}/interviews/{sid}", headers=hr).json
    assert session["mode"] == "conversational" and session["questions_total"] == 5
    plan = session["questions"]
    assert [q["competency"] for q in plan] == ["Komunikasi", *CORE_ORDER, None]

    state = start(client, headers)
    assert state["mode"] == "conversational" and len(state["acknowledgements"]) == 5
    assert state["current_question"]["index"] == 1 and state["current_question"]["total"] == 5
    assert "TASK: Turn 1 of 5" in llm.calls[0]["prompt"] and "Rina" in llm.calls[0]["prompt"]
    assert "perkenalkan" in state["instructions"][1]

    for expected_index in (2, 3, 4, 5):
        state = say(client, headers)
        assert state["current_question"]["index"] == expected_index
    # Core turns reference the previous answer (it is in the conversation block of the prompt).
    assert "stock-out turun 18 persen" in llm.calls[1]["prompt"]
    state = say(client, headers, "Apakah posisi ini bisa bekerja hybrid di Jakarta?")
    assert state["status"] == "completed"
    assert state["messages"][-1]["role"] == "assistant" and "Tim rekrutmen" in state["messages"][-1]["content"]
    assert "Closing" in llm.calls[-1]["prompt"] and "Location: Jakarta" in llm.calls[-1]["prompt"]

    turns = assistant_messages(app, sid)
    assert [t[1] for t in turns] == ["Komunikasi", *CORE_ORDER, None, None]  # competency recorded per turn
    assert [t[2] for t in turns] == ["c1", "c2", "c3", "c4", "c5", None]
    assert all(t[4] == "llm" for t in turns)
    assert all(c["max_tokens"] <= 600 and c["temperature"] == pytest.approx(0.5) for c in llm.calls)
    assert len(llm.calls) == 6  # exactly one LLM call per interviewer turn

    detail = client.get(f"{API}/interviews/{sid}", headers=hr).json
    assert detail["questions_answered"] == 5
    assert {m["mode_used"] for m in detail["messages"] if m["role"] == "assistant"} == {"llm"}
    # The existing evaluation buckets answers by the recorded competency.
    evaluation = client.get(f"{API}/interviews/{sid}/evaluation", headers=hr).json
    comps = {c["competency"]: c for c in evaluation["competencies"]}
    assert set(comps) == {"Kemampuan Teknis", "Komunikasi", "Pemecahan Masalah", "Kerja Sama Tim"}
    assert all(c["evidence"] for c in comps.values()) and evaluation["unanswered_areas"] == []


def test_personalisation_uses_cv_summary_and_prompt_stays_small(client, hr, job, app):
    llm = ConversationLLM()
    set_llm(llm)
    app_id, tid = conversational_template(client, hr, job)
    sid, headers, _ = invite(client, hr, app_id, tid)
    with app.app_context():
        snap = db.session.get(InterviewSession, sid).template_snapshot
        assert "Senior Data Scientist" in snap["cv_summary"] and "Top skills:" in snap["cv_summary"]
        assert len(snap["cv_summary"]) <= 1600 and "session_questions" in snap
    start(client, headers)
    long_answer = (LONG + " ") * 6  # ~1.4k chars per answer
    for _ in range(4):
        say(client, headers, long_answer[:3900])
    say(client, headers, "Tidak ada, terima kasih.")
    core_prompt = llm.calls[1]["prompt"]
    assert "<cv_summary>" in core_prompt and "Senior Data Scientist" in core_prompt
    assert "PT Nusantara Digital Commerce" in core_prompt
    # Token budget: system + prompt + schema overhead well under ~2.5k tokens (chars/4) on every turn.
    sizes = [len(c["system"]) + len(c["prompt"]) for c in llm.calls]
    assert max(sizes) < 8000, sizes


def test_forbidden_topic_output_is_rejected_for_the_fallback(client, hr, job, app):
    set_llm(ConversationLLM(reply=lambda task: "Boleh saya tahu berapa usia Anda dan apakah Anda sudah menikah?"))
    app_id, tid = conversational_template(client, hr, job)
    sid, headers, _ = invite(client, hr, app_id, tid)
    state = start(client, headers)
    text = state["current_question"]["text"]
    assert text.startswith("Halo Rina") and "perkenalkan diri" in text and "usia" not in text
    assert assistant_messages(app, sid)[0][4] == "fallback"


@pytest.mark.parametrize("text,kind,problem", [
    ("Apa pengalaman Anda? Dan apa kelemahan Anda?", "question", "multiple_questions"),
    ("Apa agama Anda?", "question", "forbidden_topic"),
    ("What is your current salary?", "question", "forbidden_topic"),
    ("Do you have children?", "question", "forbidden_topic"),
    ("Selamat, Anda pasti diterima di posisi ini.", "closing", "promise"),
    ("Terima kasih. Ada pertanyaan lain?", "closing", "closing_asks"),
    ("x" * 600, "question", "too_long"),
    ("Ceritakan pengalaman Anda menangani race condition di sistem third-party.", "question", None),
    ("Apakah Anda pernah menghitung suku bunga kredit?", "question", None),
])
def test_validate_turn(text, kind, problem):
    assert conversation.validate_turn(conversation.clean_turn(text), kind) == problem


def test_llm_error_falls_back_and_the_interview_completes(client, hr, job, app):
    set_llm(ConversationLLM(error=LLMError("rate_limited", "quota")))
    app_id, tid = conversational_template(client, hr, job)
    sid, headers, _ = invite(client, hr, app_id, tid)
    start(client, headers)
    state = None
    for _ in range(5):
        state = say(client, headers)
    assert state["status"] == "completed"
    turns = assistant_messages(app, sid)
    assert len(turns) == 6 and {t[4] for t in turns} == {"fallback"}
    assert "Senior Data Scientist" in turns[1][0]  # scripted first core question still personalised from the CV
    assert "apakah ada yang ingin Anda tanyakan" in turns[4][0]
    assert all("?" not in t[0] for t in turns[5:])


def test_no_llm_configured_uses_scripted_conversation(client, hr, job, app):
    app_id, tid = conversational_template(client, hr, job, questions=[])  # no guidance questions at all
    sid, headers, _ = invite(client, hr, app_id, tid)
    start(client, headers)
    for _ in range(5):
        state = say(client, headers)
    assert state["status"] == "completed"
    assert "Ceritakan satu pengalaman" in assistant_messages(app, sid)[2][0]


def test_slow_llm_times_out_to_fallback(client, hr, job, app, monkeypatch):
    monkeypatch.setitem(app.config, "CONVERSATION_LLM_TIMEOUT_SECONDS", 0.2)
    set_llm(ConversationLLM(delay=1.0))
    app_id, tid = conversational_template(client, hr, job)
    sid, headers, _ = invite(client, hr, app_id, tid)
    began = time.monotonic()
    start(client, headers)
    assert time.monotonic() - began < 1.0
    assert assistant_messages(app, sid)[0][4] == "fallback"


def test_time_cap_jumps_to_the_final_question(client, hr, job, app):
    set_llm(ConversationLLM())
    app_id, tid = conversational_template(client, hr, job)
    sid, headers, _ = invite(client, hr, app_id, tid)
    start(client, headers)
    with app.app_context():
        s = db.session.get(InterviewSession, sid)
        s.started_at = s.started_at - timedelta(minutes=6, seconds=5)  # duration 7 → within the last minute
        db.session.commit()
    state = say(client, headers, SHORT)  # short, but no follow-up near the end either
    assert state["current_question"]["index"] == 5 and not state["current_question"]["is_follow_up"]
    assert assistant_messages(app, sid)[-1][2] == "c5"
    state = say(client, headers, "Tidak ada.")
    assert state["status"] == "completed"
    evaluation = client.get(f"{API}/interviews/{sid}/evaluation", headers=hr).json
    assert set(evaluation["unanswered_areas"]) == set(CORE_ORDER)


def test_at_most_one_follow_up_in_the_whole_interview(client, hr, job, app):
    set_llm(ConversationLLM())
    app_id, tid = conversational_template(client, hr, job)
    sid, headers, _ = invite(client, hr, app_id, tid)
    start(client, headers)
    state = say(client, headers, SHORT)  # the introduction never gets a follow-up
    assert state["current_question"]["index"] == 2 and not state["current_question"]["is_follow_up"]
    state = say(client, headers, SHORT)  # very short core answer → the single follow-up
    assert state["current_question"]["index"] == 2 and state["current_question"]["is_follow_up"]
    for _ in range(4):
        state = say(client, headers, SHORT)
    assert state["status"] == "completed"
    turns = assistant_messages(app, sid)
    assert sum(1 for t in turns if t[3]) == 1
    assert turns[2][1] == "Kemampuan Teknis"  # the follow-up keeps the competency


def test_session_keeps_the_mode_it_was_created_with(client, hr, job, app):
    from tests.test_interviews import setup_interview

    app_id, tid = setup_interview(client, hr, job)
    sid, headers, _ = invite(client, hr, app_id, tid)
    start(client, headers)  # an interview in progress in template mode
    client.patch(f"{API}/interview-templates/{tid}", headers=hr,
                 json={"mode": "conversational", "num_questions": 5, "duration_minutes": 7})
    client.post(f"{API}/interview-templates/{tid}/approve", headers=hr)
    state = say(client, headers)
    assert state["mode"] == "template" and state["acknowledgements"] == []
    assert "Pertanyaan berikutnya (2 dari 4)" in state["current_question"]["text"]
    assert client.get(f"{API}/interviews/{sid}", headers=hr).json["mode"] == "template"
    with app.app_context():
        assert db.session.get(InterviewSession, sid).mode == "template"


# ---------------------------------------------------------------- acknowledgement audio


@pytest.fixture()
def tts_provider(app, monkeypatch, tmp_path):
    fake = FakeProvider()
    monkeypatch.setitem(app.config, "TTS_PROVIDER", "gemini")
    monkeypatch.setitem(app.config, "TTS_API_KEY", "test-key")
    monkeypatch.setitem(app.config, "TTS_CACHE_DIR", str(tmp_path / "tts"))
    monkeypatch.setattr(tts, "_post_json", fake)
    monkeypatch.setattr(tts, "_cooldown_until", 0.0)
    return fake


def test_acknowledgement_audio_is_pregenerated_once_and_served(client, hr, job, tts_provider):
    app_id, tid = conversational_template(client, hr, job)
    _, headers, _ = invite(client, hr, app_id, tid)
    spoken = [c["body"]["contents"][0]["parts"][0]["text"] for c in tts_provider.calls]
    assert spoken == conversation.acknowledgements("id")  # pre-generated at invitation time
    url = f"{API}/candidate-interview/acknowledgements/0/audio"
    assert client.get(url, headers=headers).status_code == 409  # not started yet
    start(client, headers)
    calls = len(tts_provider.calls)
    res = client.get(url, headers=headers)
    assert res.status_code == 200 and res.mimetype == "audio/wav"
    assert len(tts_provider.calls) == calls  # served from the disk cache, no extra quota
    assert client.get(f"{API}/candidate-interview/acknowledgements/5/audio", headers=headers).status_code == 404
    assert client.get(url, headers={"X-Interview-Token": "nope"}).status_code == 401


def test_acknowledgements_not_available_in_template_mode(client, hr, job):
    from tests.test_interviews import setup_interview

    app_id, tid = setup_interview(client, hr, job)
    _, headers, _ = invite(client, hr, app_id, tid)
    start(client, headers)
    assert client.get(f"{API}/candidate-interview/acknowledgements/0/audio", headers=headers).status_code == 404


def test_three_turn_plan_has_no_any_questions_slot():
    from app.services import conversation

    comps = [{"name": "Pengalaman Relevan", "weight": 40}, {"name": "Kesadaran Diri", "weight": 35},
             {"name": "Komunikasi", "weight": 25}]
    qs = [{"id": "q1", "competency": "Pengalaman Relevan", "text": "Ceritakan pengalaman Anda."},
          {"id": "q2", "competency": "Kesadaran Diri", "text": "Apa kelebihan dan kekurangan Anda?"}]
    plan = conversation.build_plan(comps, qs, 3, "id")
    assert [p["kind"] for p in plan] == ["intro", "core", "core"]
    assert [p["competency"] for p in plan] == ["Komunikasi", "Pengalaman Relevan", "Kesadaran Diri"]
    assert [p["text"] for p in plan[1:]] == ["Ceritakan pengalaman Anda.", "Apa kelebihan dan kekurangan Anda?"]
    assert [p["kind"] for p in conversation.build_plan(comps, qs, 4, "id")][-1] == "final"
