from __future__ import annotations

from datetime import datetime, timezone

from flask import request
from flask_restx import Namespace, Resource, fields
from pydantic import BaseModel, Field

from ..errors import bad_request, conflict, not_found
from ..extensions import db
from ..models import Application, EmailLog, InterviewSession, InterviewTemplate, Job, StageHistory
from ..security import current_actor, hr_endpoint
from ..services import audit, interviews, mailer, serializers
from . import schemas as s
from .common import ensure_application, int_arg, page_parser, paginate, pagination_args, parse_body

templates_ns = Namespace("Interview Templates", description="Competencies, questions and rubrics (reviewed before use)", path="/", decorators=[hr_endpoint])
ns = Namespace("Interviews", description="AI interview sessions, transcripts and evaluations (HR)", path="/", decorators=[hr_endpoint])


class SuggestIn(BaseModel):
    job_id: int


class InvitationIn(BaseModel):
    template_id: int
    send_email: bool = True


class BulkInviteIn(BaseModel):
    template_id: int
    application_ids: list[int] = Field(min_length=1, max_length=200)
    send_email: bool = True


class ShortlistIn(BaseModel):
    application_ids: list[int] | None = Field(default=None, max_length=500)
    top_n: int | None = Field(default=None, ge=1, le=500)
    min_score: float | None = Field(default=None, ge=0, le=100)
    note: str | None = Field(default=None, max_length=1000)


class NotesIn(BaseModel):
    reviewer_notes: str = Field(max_length=8000)


def _template(template_id: int) -> InterviewTemplate:
    t = db.session.get(InterviewTemplate, template_id)
    if t is None:
        raise not_found("Interview template")
    return t


def _payload() -> dict:
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise bad_request("Request body must be a JSON object.")
    return data


@templates_ns.route("/interview-templates")
class Templates(Resource):
    @templates_ns.doc(params={"job_id": "Filter by job"})
    @templates_ns.response(200, "Templates", [s.Template])
    def get(self):
        """List interview templates."""
        q = InterviewTemplate.query
        if job_id := int_arg("job_id"):
            q = q.filter_by(job_id=job_id)
        return [serializers.template(t) for t in q.order_by(InterviewTemplate.updated_at.desc()).all()]

    @templates_ns.expect(s.TemplateInput)
    @templates_ns.response(201, "Created as draft", s.Template)
    def post(self):
        """Create a template (status draft; it must be approved before invitations can use it)."""
        data = _payload()
        job = db.session.get(Job, data.get("job_id") or 0)
        if job is None:
            raise bad_request("A valid job_id is required.")
        clean = interviews.validate_template_payload(data)
        t = InterviewTemplate(job_id=job.id, status="draft", **clean)
        db.session.add(t)
        db.session.flush()
        audit.record("interview_template.created", "interview_template", t.id)
        db.session.commit()
        return serializers.template(t), 201


@templates_ns.route("/interview-templates/suggest")
class TemplateSuggest(Resource):
    @templates_ns.expect(templates_ns.model("SuggestInput", {"job_id": s.fields.Integer(required=True, example=1)}))
    @templates_ns.response(200, "Suggested (unsaved) template", s.TemplateInput)
    def post(self):
        """Suggest competencies, questions and rubrics for a job (LLM if configured, otherwise the built-in
        competency library). Nothing is saved; HR reviews and edits before creating the template."""
        body = parse_body(SuggestIn)
        job = db.session.get(Job, body.job_id)
        if job is None:
            raise not_found("Job")
        return interviews.suggest_template(job)


@templates_ns.route("/interview-templates/<int:template_id>")
class TemplateItem(Resource):
    @templates_ns.response(200, "Template", s.Template)
    def get(self, template_id: int):
        """Get a template."""
        return serializers.template(_template(template_id))

    @templates_ns.expect(s.TemplateInput)
    @templates_ns.response(200, "Updated (returns to draft)", s.Template)
    def patch(self, template_id: int):
        """Edit a template. Editing an approved template moves it back to draft for re-approval.
        Running interviews keep the version they were created with."""
        t = _template(template_id)
        data = _payload()
        current = serializers.template(t)
        merged = {k: data.get(k, current[k]) for k in ("name", "language", "mode", "cv_questions", "competencies", "questions", "num_questions",
                                                       "duration_minutes", "follow_up_rules", "invitation_expiry_hours")}
        clean = interviews.validate_template_payload(merged)
        for key, value in clean.items():
            setattr(t, key, value)
        t.status = "draft"
        t.approved_by_id = None
        audit.record("interview_template.updated", "interview_template", t.id)
        db.session.commit()
        return serializers.template(t)


@templates_ns.route("/interview-templates/<int:template_id>/approve")
class TemplateApprove(Resource):
    @templates_ns.response(200, "Approved", s.Template)
    def post(self, template_id: int):
        """Approve a reviewed template so it can be used for invitations."""
        t = _template(template_id)
        interviews.validate_template_payload(serializers.template(t))
        t.status = "approved"
        t.approved_by_id = current_actor().id
        audit.record("interview_template.approved", "interview_template", t.id)
        db.session.commit()
        return serializers.template(t)


# ---------------------------------------------------------------- sessions (HR)

def _session(session_id: int) -> InterviewSession:
    session = db.session.get(InterviewSession, session_id)
    if session is None:
        raise not_found("Interview")
    ensure_application(session.application)
    return session


list_parser = page_parser()
list_parser.add_argument("status", location="args")
list_parser.add_argument("job_id", type=int, location="args")
list_parser.add_argument("application_id", type=int, location="args")


@ns.route("/interviews")
class Sessions(Resource):
    @ns.expect(list_parser)
    @ns.response(200, "Sessions (messages omitted)", s.SessionPage)
    def get(self):
        """List interview sessions."""
        page, size = pagination_args()
        q = InterviewSession.query.join(Application)
        if job_id := int_arg("job_id"):
            q = q.filter(Application.job_id == job_id)
        if app_id := int_arg("application_id"):
            q = q.filter(InterviewSession.application_id == app_id)
        status = request.args.get("status")
        now = datetime.now(timezone.utc)
        if status == "expired":
            q = q.filter(InterviewSession.status.in_(("pending", "in_progress")), InterviewSession.expires_at < now)
        elif status in ("pending", "in_progress"):
            q = q.filter(InterviewSession.status == status, InterviewSession.expires_at >= now)
        elif status:
            q = q.filter(InterviewSession.status == status)
        q = q.order_by(InterviewSession.created_at.desc())
        return paginate(q, lambda x: serializers.interview_session(x, include_messages=False), page, size)


@ns.route("/applications/<int:application_id>/interviews")
class CreateSession(Resource):
    @ns.expect(s.InvitationInput)
    @ns.response(201, "Invitation created. The raw link is shown only once.", s.Invitation)
    @ns.response(409, "Template not approved", s.Error)
    def post(self, application_id: int):
        """Create an interview session and invitation link for an application."""
        application = ensure_application(db.session.get(Application, application_id))
        body = parse_body(InvitationIn)
        session, raw = interviews.create_session(application, _template(body.template_id), current_actor().id)
        email = interviews.send_invitation_email(session, raw, current_actor().id) if body.send_email else None
        return {
            "session": serializers.interview_session(session),
            "invitation_url": interviews.invitation_url(raw),
            "expires_at": serializers.iso(session.expires_at),
            "email": serializers.email_log(email) if email else None,
        }, 201


@ns.route("/jobs/<int:job_id>/shortlist")
class Shortlist(Resource):
    @ns.expect(ns.model("ShortlistInput", {
        "application_ids": fields.List(fields.Integer, example=[12, 15, 18]),
        "top_n": fields.Integer(example=10, description="Pick the N highest-scoring screened applications instead"),
        "min_score": fields.Float(example=60, description="Optional minimum match score when using top_n"),
        "note": fields.String(example="Top 10 from AI screening, reviewed by HR"),
    }))
    @ns.response(200, "Applications moved to 'shortlisted'", s.ApplicationPage)
    def post(self, job_id: int):
        """Move selected applications (or the top N by match score) to the shortlisted stage. Only applications
        in 'applied' or 'screening' are moved; this is an HR decision recorded in the stage history."""
        job = db.session.get(Job, job_id)
        if job is None:
            raise not_found("Job")
        body = parse_body(ShortlistIn)
        if not body.application_ids and not body.top_n:
            raise bad_request("Provide application_ids or top_n.")
        q = Application.query.filter(Application.job_id == job.id, Application.stage.in_(("applied", "screening")))
        if body.application_ids:
            apps = q.filter(Application.id.in_(body.application_ids)).all()
        else:
            q = q.filter(Application.match_score.isnot(None))
            if body.min_score is not None:
                q = q.filter(Application.match_score >= body.min_score)
            apps = q.order_by(Application.match_score.desc(), Application.id).limit(body.top_n).all()
        note = body.note or "Shortlisted from AI screening ranking."
        for a in apps:
            db.session.add(StageHistory(application_id=a.id, from_stage=a.stage, to_stage="shortlisted",
                                        changed_by_id=current_actor().id, note=note))
            a.stage = "shortlisted"
        audit.record("job.shortlisted", "job", job.id, {"application_ids": [a.id for a in apps]})
        db.session.commit()
        items = [serializers.application(a) for a in apps]
        return {"items": items, "total": len(items), "page": 1, "page_size": len(items)}


@ns.route("/jobs/<int:job_id>/interviews/bulk-invite")
class BulkInvite(Resource):
    @ns.expect(ns.model("BulkInviteInput", {
        "template_id": fields.Integer(required=True, example=1),
        "application_ids": fields.List(fields.Integer, required=True, example=[12, 15, 18]),
        "send_email": fields.Boolean(example=True),
    }))
    @ns.response(200, "Per-candidate result: invited (with email status) or skipped")
    def post(self, job_id: int):
        """Create AI interview sessions for several candidates and email each their invitation link. Every session
        gets personalised questions from that candidate's CV. Candidates with an active invitation are skipped.
        Raw links are returned once so HR can share them manually when email isn't configured or fails."""
        job = db.session.get(Job, job_id)
        if job is None:
            raise not_found("Job")
        body = parse_body(BulkInviteIn)
        template = _template(body.template_id)
        if template.job_id != job.id:
            raise bad_request("The template belongs to a different job.")
        if template.status != "approved":
            raise conflict("Only approved interview templates can be used.", code="template_not_approved")
        apps = {a.id: a for a in Application.query.filter(Application.job_id == job.id,
                                                          Application.id.in_(body.application_ids)).all()}
        results = []
        for app_id in dict.fromkeys(body.application_ids):
            a = apps.get(app_id)
            if a is None:
                results.append({"application_id": app_id, "status": "skipped", "reason": "Not an application for this job."})
                continue
            results.append(interviews.invite_application(a, template, send_email=body.send_email,
                                                         created_by_id=current_actor().id))
        return {
            "results": results,
            "invited": sum(1 for r in results if r["status"] == "invited"),
            "emailed": sum(1 for r in results if r.get("email_status") == "sent"),
            "smtp_configured": mailer.smtp_configured(),
        }


@ns.route("/email-logs")
class EmailLogs(Resource):
    @ns.doc(params={"session_id": "Filter by interview session"})
    def get(self):
        """Recent outgoing emails (bodies are stored with invitation tokens redacted)."""
        q = EmailLog.query
        if sid := int_arg("session_id"):
            q = q.filter_by(session_id=sid)
        return [serializers.email_log(e) for e in q.order_by(EmailLog.id.desc()).limit(200).all()]


@ns.route("/interviews/<int:session_id>")
class SessionItem(Resource):
    @ns.response(200, "Session with transcript", s.Session)
    def get(self, session_id: int):
        """Get a session and its full transcript."""
        return serializers.interview_session(_session(session_id))


@ns.route("/interviews/<int:session_id>/revoke")
class SessionRevoke(Resource):
    @ns.response(200, "Revoked", s.Session)
    def post(self, session_id: int):
        """Revoke the invitation link immediately."""
        session = _session(session_id)
        interviews.revoke(session)
        return serializers.interview_session(session)


@ns.route("/interviews/<int:session_id>/complete")
class SessionComplete(Resource):
    @ns.response(200, "Completed; evaluation queued", s.Session)
    def post(self, session_id: int):
        """Force-complete a session (e.g. candidate stopped responding) and queue evaluation."""
        session = _session(session_id)
        if session.status == "pending":
            raise conflict("The candidate has not started this interview.", code="not_started")
        interviews.complete(session, by="hr")
        return serializers.interview_session(session)


@ns.route("/interviews/<int:session_id>/evaluation")
class SessionEvaluation(Resource):
    @ns.response(200, "Latest evaluation", s.Evaluation)
    @ns.response(404, "No evaluation yet", s.Error)
    def get(self, session_id: int):
        """Get the latest rubric-based evaluation."""
        session = _session(session_id)
        if not session.evaluations:
            raise not_found("Evaluation")
        return serializers.evaluation(session.evaluations[0])

    @ns.response(202, "Re-evaluation queued", s.Evaluation)
    def post(self, session_id: int):
        """Run the evaluation again (e.g. after configuring the LLM)."""
        evaluation = interviews.rerun_evaluation(_session(session_id))
        return serializers.evaluation(evaluation), 202

    @ns.expect(s.EvaluationNotes)
    @ns.response(200, "Saved", s.Evaluation)
    def patch(self, session_id: int):
        """Save reviewer notes on the latest evaluation."""
        session = _session(session_id)
        if not session.evaluations:
            raise not_found("Evaluation")
        evaluation = session.evaluations[0]
        evaluation.reviewer_notes = parse_body(NotesIn).reviewer_notes
        evaluation.reviewed_by_id = current_actor().id
        evaluation.reviewed_at = datetime.now(timezone.utc)
        audit.record("interview.evaluation_reviewed", "interview_session", session.id)
        db.session.commit()
        return serializers.evaluation(evaluation)
