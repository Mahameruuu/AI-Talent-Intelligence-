from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from flask import request
from flask_restx import Namespace, Resource
from pydantic import BaseModel, Field
from sqlalchemy import func, or_

from ..errors import bad_request, conflict, not_found
from ..extensions import db
from ..models import Application, Candidate, Document, HRReview, InterviewSession, Job, StageHistory
from ..security import current_actor, hr_endpoint
from ..services import audit, deletion, documents, serializers
from . import schemas as s
from .common import ensure_application, int_arg, page_parser, paginate, pagination_args, parse_body

ns = Namespace("Applications", description="Applications, CV documents and HR reviews", path="/", decorators=[hr_endpoint])

Stage = Literal["applied", "screening", "shortlisted", "interview", "offer", "hired", "rejected", "withdrawn"]


class ApplicationIn(BaseModel):
    candidate_id: int
    job_id: int


class ApplicationPatch(BaseModel):
    stage: Stage | None = None
    note: str | None = Field(default=None, max_length=2000)


class DecisionIn(BaseModel):
    decision: Literal["accepted", "rejected"]
    note: str | None = Field(default=None, max_length=2000)


DECISION_STAGE = {"accepted": "hired", "rejected": "rejected"}
DECISION_LABEL = {"accepted": "Accepted", "rejected": "Rejected"}


class ReviewIn(BaseModel):
    notes: str | None = Field(default=None, max_length=8000)
    recommendation: Literal["advance", "hold", "needs_more_info", "not_proceed"] | None = None
    evidence_validations: dict[str, Literal["confirmed", "rejected"]] = Field(default_factory=dict)
    new_stage: Stage | None = None


def change_stage(application: Application, stage: str, note: str | None) -> None:
    if stage == application.stage:
        return
    if application.decision:
        raise conflict("The HR decision for this application is final; its stage can't be changed.",
                       code="already_decided")
    db.session.add(StageHistory(application_id=application.id, from_stage=application.stage, to_stage=stage,
                                changed_by_id=current_actor().id, note=note))
    audit.record("application.stage_changed", "application", application.id, {"from": application.stage, "to": stage})
    application.stage = stage


list_parser = page_parser()
list_parser.add_argument("job_id", type=int, location="args")
list_parser.add_argument("stage", location="args")
list_parser.add_argument("q", location="args", help="Search candidate name or email")
list_parser.add_argument("sort", location="args", choices=("score", "created"), default="created",
                         help="score = highest match score first")


@ns.route("/applications")
class Applications(Resource):
    @ns.expect(list_parser)
    @ns.response(200, "Applications", s.ApplicationPage)
    def get(self):
        """List applications."""
        page, size = pagination_args()
        q = Application.query
        if job_id := int_arg("job_id"):
            q = q.filter(Application.job_id == job_id)
        if request.args.get("stage"):
            q = q.filter(Application.stage == request.args["stage"])
        if term := (request.args.get("q") or "").strip():
            like = f"%{term}%"
            q = q.join(Candidate).filter(or_(Candidate.full_name.ilike(like), Candidate.email.ilike(like),
                                             Candidate.corrections["full_name"].astext.ilike(like)))
        if request.args.get("sort") == "score":
            q = q.order_by(func.coalesce(Application.match_score, -1).desc(), Application.created_at.desc())
        else:
            q = q.order_by(Application.created_at.desc())
        return paginate(q, serializers.application, page, size)

    @ns.expect(s.ApplicationCreate)
    @ns.response(201, "Created", s.Application)
    @ns.response(409, "Candidate already applied to this job", s.Error)
    def post(self):
        """Link an existing candidate to a job."""
        body = parse_body(ApplicationIn)
        candidate = db.session.get(Candidate, body.candidate_id)
        job = db.session.get(Job, body.job_id)
        if candidate is None or job is None:
            raise bad_request("Unknown candidate_id or job_id.")
        if Application.query.filter_by(candidate_id=candidate.id, job_id=job.id).first():
            raise conflict("This candidate already has an application for this job.", code="duplicate_application")
        application = Application(candidate_id=candidate.id, job_id=job.id, stage="applied", source="manual")
        db.session.add(application)
        db.session.flush()
        db.session.add(StageHistory(application_id=application.id, to_stage="applied", changed_by_id=current_actor().id))
        audit.record("application.created", "application", application.id, {"job_id": job.id})
        db.session.commit()
        return serializers.application(application), 201


@ns.route("/applications/<int:application_id>")
class ApplicationItem(Resource):
    @ns.response(200, "Application", s.Application)
    @ns.response(404, "Not found", s.Error)
    def get(self, application_id: int):
        """Get an application with stage history and latest document."""
        return serializers.application(ensure_application(db.session.get(Application, application_id)))

    @ns.expect(s.ApplicationUpdate)
    @ns.response(200, "Updated", s.Application)
    def patch(self, application_id: int):
        """Update the stage (recorded in history). Stage changes are always an HR decision."""
        application = ensure_application(db.session.get(Application, application_id))
        body = parse_body(ApplicationPatch).model_dump(exclude_unset=True)
        if body.get("stage"):
            change_stage(application, body["stage"], body.get("note"))
        db.session.commit()
        return serializers.application(application)

    @ns.response(204, "Deleted")
    @ns.response(404, "Not found", s.Error)
    def delete(self, application_id: int):
        """Permanently delete one application with its CV files, screening results, HR reviews, stage history
        and AI interviews. If it was the candidate's last application, the candidate is deleted too."""
        application = db.session.get(Application, application_id)
        if application is None:
            raise not_found("Application")
        candidate = application.candidate
        candidate_id, job_id = candidate.id, application.job_id
        others = Application.query.filter(Application.candidate_id == candidate_id,
                                          Application.id != application.id).count()
        if others:
            purge = deletion.purge_applications([application_id])
        else:
            purge = deletion.purge_candidate(candidate)
        audit.record("application.deleted", "application", application_id,
                     {"candidate_id": candidate_id, "job_id": job_id,
                      "candidate_deleted": not others, **purge.counts()})
        db.session.commit()
        deletion.remove_files(purge.storage_keys)
        return "", 204


upload_parser = ns.parser()
upload_parser.add_argument("file", location="files", type="file", required=True, help="CV in PDF or DOCX (max 10 MB)")


@ns.route("/applications/<int:application_id>/documents")
class ApplicationDocuments(Resource):
    @ns.doc(consumes=["multipart/form-data"])
    @ns.expect(upload_parser)
    @ns.response(202, "Queued for processing", s.DocumentInfo)
    @ns.response(200, "Identical file already uploaded; existing document returned", s.DocumentInfo)
    @ns.response(400, "Invalid file", s.Error)
    @ns.response(413, "File too large", s.Error)
    def post(self, application_id: int):
        """Upload a CV for an application. Processing (text extraction, NLP, screening) runs in the background;
        poll `GET /documents/{id}/status`."""
        application = ensure_application(db.session.get(Application, application_id))
        file = request.files.get("file")
        if file is None or not file.filename:
            raise bad_request("A CV file is required (field 'file').")
        doc, created = documents.create_document(application, file.filename, file.read(), current_actor().id)
        return serializers.document_info(doc), 202 if created else 200


def _document(document_id: int) -> Document:
    doc = db.session.get(Document, document_id)
    if doc is None:
        raise not_found("Document")
    ensure_application(doc.application)
    return doc


@ns.route("/documents/<int:document_id>/status")
class DocumentStatus(Resource):
    @ns.response(200, "Processing status and pipeline steps", s.DocumentInfo)
    def get(self, document_id: int):
        """Poll document processing status."""
        return serializers.document_info(_document(document_id))


@ns.route("/documents/<int:document_id>")
class DocumentItem(Resource):
    @ns.response(200, "Extraction, cleaned text, sections and methods", s.DocumentDetail)
    def get(self, document_id: int):
        """Get the full NLP result for a document (used by the evidence viewer)."""
        return serializers.document_detail(_document(document_id))


@ns.route("/documents/<int:document_id>/reprocess")
class DocumentReprocess(Resource):
    @ns.response(202, "Queued", s.DocumentInfo)
    def post(self, document_id: int):
        """Run the NLP pipeline again (e.g. after a pipeline upgrade or a provider failure)."""
        return serializers.document_info(documents.reprocess(_document(document_id))), 202


@ns.route("/applications/<int:application_id>/reviews")
class ApplicationReviews(Resource):
    @ns.response(200, "Reviews, newest first", [s.Review])
    def get(self, application_id: int):
        """List HR reviews for an application."""
        application = ensure_application(db.session.get(Application, application_id))
        return [serializers.review(r) for r in application.reviews]

    @ns.expect(s.ReviewInput)
    @ns.response(201, "Created", s.Review)
    def post(self, application_id: int):
        """Add an HR review: notes, recommendation, evidence validations and optional stage change.
        Reviews are stored separately and never alter the original AI result."""
        application = ensure_application(db.session.get(Application, application_id))
        body = parse_body(ReviewIn)
        if not (body.notes or body.recommendation or body.evidence_validations or body.new_stage):
            raise bad_request("Provide notes, a recommendation, evidence validations or a stage change.")
        latest = application.screenings[0] if application.screenings else None
        if body.evidence_validations and latest:
            valid_keys = {r["key"] for r in latest.requirements}
            unknown = sorted(set(body.evidence_validations) - valid_keys)
            if unknown:
                raise bad_request("Unknown requirement keys in evidence_validations.", {"keys": unknown})
        review = HRReview(application_id=application.id, screening_result_id=latest.id if latest else None,
                          reviewer_id=current_actor().id, notes=body.notes, recommendation=body.recommendation,
                          evidence_validations=body.evidence_validations)
        db.session.add(review)
        if body.new_stage:
            change_stage(application, body.new_stage, body.notes)
        db.session.flush()
        audit.record("application.reviewed", "application", application.id,
                     {"review_id": review.id, "recommendation": body.recommendation})
        db.session.commit()
        return serializers.review(review), 201


@ns.route("/applications/<int:application_id>/decision")
class ApplicationDecision(Resource):
    @ns.expect(s.DecisionInput)
    @ns.response(200, "Decided; stage moved to hired (accepted) or rejected", s.Application)
    @ns.response(409, "interview_not_completed or already_decided", s.Error)
    def post(self, application_id: int):
        """Final HR hiring decision after the AI interview (accepted or rejected). It can't be changed afterwards.
        Requires stage 'interview' and at least one completed interview. Pending (not started) invitations for
        the application are revoked."""
        actor = current_actor()
        application = ensure_application(db.session.get(Application, application_id))
        body = parse_body(DecisionIn)
        if application.decision:
            raise conflict("A final decision has already been made for this application.", code="already_decided")
        sessions = InterviewSession.query.filter_by(application_id=application.id).all()
        if application.stage != "interview" or not any(x.status == "completed" for x in sessions):
            raise conflict("A decision can be made only after the AI interview is completed.",
                           code="interview_not_completed")
        note = (body.note or "").strip() or None
        now = datetime.now(timezone.utc)
        stage = DECISION_STAGE[body.decision]
        history_note = f"HR decision: {DECISION_LABEL[body.decision]}" + (f" — {note}" if note else "")
        db.session.add(StageHistory(application_id=application.id, from_stage=application.stage, to_stage=stage,
                                    changed_by_id=actor.id, note=history_note))
        revoked = []
        for x in sessions:
            if x.status == "pending":
                x.status = "revoked"
                x.revoked_at = now
                revoked.append(x.id)
                audit.record("interview.revoked", "interview_session", x.id, {"reason": "application_decided"})
        audit.record("application.decision", "application", application.id,
                     {"decision": body.decision, "from": application.stage, "to": stage,
                      "revoked_sessions": revoked})
        application.decision = body.decision
        application.decision_note = note
        application.decided_at = now
        application.decided_by_id = actor.id
        application.stage = stage
        db.session.commit()
        return serializers.application(application)
