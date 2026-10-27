"""Public, candidate-facing interview endpoints.

Authenticated only by the invitation token in the ``X-Interview-Token`` header (never in the URL, so it
does not end up in access logs). These endpoints expose no internal HR data or evaluation results.
"""

from __future__ import annotations

from datetime import timedelta

from flask import Response, request
from flask_restx import Namespace, Resource
from typing import Literal

from pydantic import BaseModel, Field

from ..errors import ApiError
from ..extensions import db
from ..models import InterviewMessage, InterviewSession
from ..security import hash_token
from ..services import conversation, interviews, tts
from . import schemas as s
from .common import parse_body

ns = Namespace("Candidate Interview", description="Public endpoints used by candidates via their invitation link", path="/")
TOKEN = [{"InterviewToken": []}]


class StartIn(BaseModel):
    consent: bool


class MessageIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    input_mode: Literal["voice", "text"] = "text"


def _session() -> InterviewSession:
    raw = request.headers.get("X-Interview-Token", "").strip()
    if not raw or len(raw) > 200:
        raise ApiError(401, "invalid_token", "This interview link is invalid.")
    session = InterviewSession.query.filter_by(token_hash=hash_token(raw)).first()
    if session is None:
        raise ApiError(401, "invalid_token", "This interview link is invalid.")
    status = interviews.effective_status(session)
    if status == "revoked":
        raise ApiError(410, "revoked", "This interview link has been revoked.")
    if status == "expired":
        raise ApiError(410, "expired", "This interview link has expired.")
    return session


@ns.route("/candidate-interview")
class State(Resource):
    @ns.doc(security=TOKEN)
    @ns.response(200, "Interview state for the candidate", s.CandidateState)
    @ns.response(401, "Invalid token", s.Error)
    @ns.response(410, "Expired or revoked", s.Error)
    def get(self):
        """Instructions, privacy notice, progress and conversation so far."""
        return interviews.candidate_state(_session())


@ns.route("/candidate-interview/start")
class Start(Resource):
    @ns.doc(security=TOKEN)
    @ns.expect(s.StartInput)
    @ns.response(200, "Started", s.CandidateState)
    @ns.response(409, "Already completed", s.Error)
    def post(self):
        """Accept the privacy notice and start (or resume) the interview."""
        session = _session()
        interviews.start(session, parse_body(StartIn).consent)
        return interviews.candidate_state(session)


@ns.route("/candidate-interview/messages")
class Messages(Resource):
    @ns.doc(security=TOKEN)
    @ns.expect(s.MessageInput)
    @ns.response(200, "Answer saved; next question or follow-up appended", s.CandidateState)
    def post(self):
        """Send an answer to the current question."""
        session = _session()
        body = parse_body(MessageIn)
        interviews.post_answer(session, body.content, body.input_mode)
        return interviews.candidate_state(session)


@ns.route("/candidate-interview/complete")
class Complete(Resource):
    @ns.doc(security=TOKEN)
    @ns.response(200, "Ended", s.CandidateState)
    def post(self):
        """End the interview early. Answers given so far are kept and evaluated."""
        session = _session()
        if session.status == "pending":
            raise ApiError(409, "not_started", "The interview has not started yet.")
        interviews.complete(session, by="candidate")
        return interviews.candidate_state(session)


# Audio stays available for a short while after completion so the closing message can still be played.
AUDIO_GRACE_AFTER_COMPLETION = timedelta(minutes=30)


@ns.route("/candidate-interview/messages/<int:message_id>/audio")
@ns.param("message_id", "Interviewer message id (from `messages` / `current_question.message_id`)")
class MessageAudio(Resource):
    @ns.doc(security=TOKEN, description=(
        "The interviewer message read aloud (server text-to-speech), as `audio/wav`. Pre-generated when the "
        "message is created; synthesized on demand otherwise. Only interviewer messages of the token's own "
        "session. When `voice.server_tts` is false or the provider fails (e.g. rate limit) it answers 503 "
        "`tts_unavailable` and the browser falls back to its own speech synthesis."))
    @ns.produces(["audio/wav"])
    @ns.response(200, "WAV audio (24 kHz mono 16-bit)")
    @ns.response(401, "Invalid token", s.Error)
    @ns.response(404, "Unknown message, or not an interviewer message of this interview", s.Error)
    @ns.response(409, "Interview not active", s.Error)
    @ns.response(410, "Expired or revoked", s.Error)
    @ns.response(503, "Text-to-speech unavailable", s.Error)
    def get(self, message_id: int):
        """Interviewer message as speech audio."""
        session = _session()
        message = db.session.get(InterviewMessage, message_id)
        if message is None or message.session_id != session.id or message.role != "assistant":
            raise ApiError(404, "not_found", "Message not found.")
        _ensure_audio_allowed(session)
        return _speech(message.content, interviews.session_language(session))


def _ensure_audio_allowed(session: InterviewSession) -> None:
    if session.status == "completed":
        done = session.completed_at
        if done is None or interviews.now() - done > AUDIO_GRACE_AFTER_COMPLETION:
            raise ApiError(409, "not_active", "This interview is no longer active.")
    elif session.status != "in_progress":
        raise ApiError(409, "not_active", "This interview is not active.")


def _speech(text: str, lang: str) -> Response:
    try:
        audio = tts.synthesize(text, lang)
    except tts.TTSError as exc:
        raise ApiError(503, "tts_unavailable", "Interviewer audio is not available right now.",
                       {"reason": exc.code}) from None
    return Response(audio, mimetype="audio/wav", headers={"Cache-Control": "private, max-age=3600"})


@ns.route("/candidate-interview/acknowledgements/<int:index>/audio")
@ns.param("index", "0-based index into `acknowledgements` of the candidate state")
class AcknowledgementAudio(Resource):
    @ns.doc(security=TOKEN, description=(
        "Conversational mode: a short acknowledgement line (e.g. \"Baik, terima kasih atas jawabannya.\") as "
        "`audio/wav`, played by the room right after an answer is submitted while the next turn is generated. "
        "The lines are fixed per language and cached forever on the server, so they cost TTS quota only once. "
        "503 `tts_unavailable` → the browser speaks the line itself."))
    @ns.produces(["audio/wav"])
    @ns.response(200, "WAV audio (24 kHz mono 16-bit)")
    @ns.response(401, "Invalid token", s.Error)
    @ns.response(404, "Unknown acknowledgement, or not a conversational interview", s.Error)
    @ns.response(409, "Interview not active", s.Error)
    @ns.response(503, "Text-to-speech unavailable", s.Error)
    def get(self, index: int):
        """Acknowledgement line as speech audio."""
        session = _session()
        lines = conversation.acknowledgements(interviews.session_language(session)) \
            if interviews.is_conversational(session) else []
        if not 0 <= index < len(lines):
            raise ApiError(404, "not_found", "Acknowledgement not found.")
        _ensure_audio_allowed(session)
        return _speech(lines[index], interviews.session_language(session))
