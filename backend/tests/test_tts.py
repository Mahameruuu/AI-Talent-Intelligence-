"""Server text-to-speech for the interviewer: provider parsing, caching, pre-generation and the audio endpoint."""

import base64
import struct

import pytest

from app.models import InterviewMessage
from app.services import tts
from tests.test_interviews import API, LONG, invite, setup_interview

PCM = b"\x01\x00\x02\x00" * 50


def wav(pcm: bytes = PCM) -> bytes:
    return tts.pcm_to_wav(pcm)


def gemini_payload(data: bytes, mime: str = "audio/wav") -> dict:
    return {"candidates": [{"content": {"parts": [{"inlineData": {"mimeType": mime,
                                                                  "data": base64.b64encode(data).decode()}}]}}]}


class FakeProvider:
    def __init__(self, fail: list[tts.TTSError] | None = None):
        self.calls: list[dict] = []
        self.fail = list(fail or [])

    def __call__(self, url, body, api_key, timeout):
        self.calls.append({"url": url, "body": body, "api_key": api_key})
        if self.fail:
            raise self.fail.pop(0)
        return gemini_payload(wav())


@pytest.fixture()
def provider(app, monkeypatch, tmp_path):
    fake = FakeProvider()
    monkeypatch.setitem(app.config, "TTS_PROVIDER", "gemini")
    monkeypatch.setitem(app.config, "TTS_API_KEY", "test-key")
    monkeypatch.setitem(app.config, "TTS_CACHE_DIR", str(tmp_path / "tts"))
    monkeypatch.setattr(tts, "_post_json", fake)
    monkeypatch.setattr(tts, "_cooldown_until", 0.0)
    return fake


def test_parses_wav_and_wraps_pcm():
    assert tts._audio_from_response(gemini_payload(wav())) == wav()
    wrapped = tts._audio_from_response(gemini_payload(PCM, "audio/L16;codec=pcm;rate=24000"))
    assert wrapped[:4] == b"RIFF" and wrapped[8:12] == b"WAVE" and wrapped.endswith(PCM)
    assert struct.unpack("<I", wrapped[24:28])[0] == 24000
    with pytest.raises(tts.TTSError):
        tts._audio_from_response({"candidates": []})


def test_clean_text_strips_markdown_and_emoji():
    assert tts.clean_text("**Halo** 👋 _Rina_, lihat [tautan](https://x.y)!") == "Halo Rina, lihat tautan!"


def test_synthesize_caches_and_sends_only_the_text(app, provider):
    with app.app_context():
        first = tts.synthesize("Ceritakan **pengalaman** Anda.", "id")
        second = tts.synthesize("Ceritakan **pengalaman** Anda.", "id")
    assert first == second == wav()
    assert len(provider.calls) == 1
    call = provider.calls[0]
    assert "gemini-3.8-flash-lite-tts" in call["url"] and "test-key" not in call["url"]
    prompt = call["body"]["contents"][0]["parts"][0]["text"]
    assert prompt == "Ceritakan pengalaman Anda."  # only the text: style prompts get read aloud
    assert call["body"]["generationConfig"]["speechConfig"]["voiceConfig"]["prebuiltVoiceConfig"]["voiceName"] == "Kore"


def test_fallback_model_then_rate_limit_cooldown(app, provider):
    provider.fail = [tts.TTSError("provider_error", "boom")]
    with app.app_context():
        assert tts.synthesize("Halo", "id") == wav()
    assert "gemini-3.8-flash-tts" in provider.calls[1]["url"]

    provider.fail = [tts.TTSError("rate_limited", "429"), tts.TTSError("rate_limited", "429")]
    with app.app_context():
        with pytest.raises(tts.TTSError) as exc:
            tts.synthesize("Pertanyaan lain", "id")
        assert exc.value.code == "rate_limited"
        calls = len(provider.calls)
        with pytest.raises(tts.TTSError):
            tts.synthesize("Pertanyaan ketiga", "id")  # cooling down: no extra provider call
    assert len(provider.calls) == calls


def test_disabled_raises(app):
    with app.app_context():
        assert not tts.enabled()
        with pytest.raises(tts.TTSError) as exc:
            tts.synthesize("Halo", "id")
    assert exc.value.code == "disabled"


def _started(client, hr, job, prefix="rina"):
    app_id, tid = setup_interview(client, hr, job, prefix=prefix)
    session_id, headers, _ = invite(client, hr, app_id, tid)
    state = client.post(f"{API}/candidate-interview/start", json={"consent": True}, headers=headers).json
    return session_id, headers, state


def test_pregenerates_on_message_creation_and_serves_audio(client, hr, job, provider):
    _, headers, state = _started(client, hr, job)
    assert state["voice"] == {"server_tts": True}
    # first question + the likely next question (the greeting is only shown in the transcript)
    assert len(provider.calls) == 2
    question_id = state["current_question"]["message_id"]

    res = client.get(f"{API}/candidate-interview/messages/{question_id}/audio", headers=headers)
    assert res.status_code == 200
    assert res.mimetype == "audio/wav" and res.data == wav()
    assert res.headers["Cache-Control"] == "private, max-age=3600"
    assert len(provider.calls) == 2  # served from the cache

    # The next question was pre-generated from its predicted text: answering creates it without a new call.
    state = client.post(f"{API}/candidate-interview/messages", json={"content": LONG}, headers=headers).json
    assert state["current_question"]["index"] == 2
    prompts = [c["body"]["contents"][0]["parts"][0]["text"] for c in provider.calls]
    assert any(p.endswith(state["current_question"]["text"]) for p in prompts[:2])
    assert len(prompts) == len(set(prompts))  # only the (new) upcoming question was synthesized


def test_closing_message_not_pregenerated_but_available(client, hr, job, provider):
    _, headers, _ = _started(client, hr, job)
    calls = len(provider.calls)
    state = client.post(f"{API}/candidate-interview/complete", headers=headers).json
    assert state["status"] == "completed" and len(provider.calls) == calls
    closing = state["messages"][-1]
    assert closing["role"] == "assistant"
    res = client.get(f"{API}/candidate-interview/messages/{closing['id']}/audio", headers=headers)
    assert res.status_code == 200 and len(provider.calls) == calls + 1


def test_audio_endpoint_auth_and_ownership(client, hr, job, provider, app):
    _, headers, state = _started(client, hr, job)
    question_id = state["current_question"]["message_id"]
    url = f"{API}/candidate-interview/messages/{question_id}/audio"

    assert client.get(url).status_code == 401
    assert client.get(url, headers={"X-Interview-Token": "wrong"}).status_code == 401

    # Another candidate's token cannot read this session's messages.
    _, other_headers, _ = _started(client, hr, job, prefix="budi")
    assert client.get(url, headers=other_headers).status_code == 404
    assert client.get(f"{API}/candidate-interview/messages/999999/audio", headers=headers).status_code == 404

    client.post(f"{API}/candidate-interview/messages", json={"content": LONG}, headers=headers)
    with app.app_context():
        answer = InterviewMessage.query.filter_by(role="candidate").first()
        assert answer is not None
        answer_id = answer.id
    assert client.get(f"{API}/candidate-interview/messages/{answer_id}/audio", headers=headers).status_code == 404


def test_audio_503_when_disabled_or_provider_fails(client, hr, job, app, monkeypatch, tmp_path):
    monkeypatch.setitem(app.config, "TTS_CACHE_DIR", str(tmp_path / "tts"))
    _, headers, state = _started(client, hr, job)
    assert state["voice"] == {"server_tts": False}
    url = f"{API}/candidate-interview/messages/{state['current_question']['message_id']}/audio"
    res = client.get(url, headers=headers)
    assert res.status_code == 503 and res.json["error"]["code"] == "tts_unavailable"

    monkeypatch.setitem(app.config, "TTS_PROVIDER", "gemini")
    monkeypatch.setitem(app.config, "TTS_API_KEY", "test-key")
    monkeypatch.setattr(tts, "_cooldown_until", 0.0)
    monkeypatch.setattr(tts, "_post_json", FakeProvider(fail=[tts.TTSError("timeout", "slow")] * 2))
    res = client.get(url, headers=headers)
    assert res.status_code == 503 and res.json["error"]["code"] == "tts_unavailable"
