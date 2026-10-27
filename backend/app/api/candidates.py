from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import exists, or_, select, text

from ..errors import ApiError, bad_request, not_found
from ..extensions import db
from ..models import Application, Candidate, Document, Job, StageHistory
from ..security import current_actor, hr_endpoint
from ..services import audit, deletion, documents, serializers
from . import schemas as s
from .common import ensure_candidate, float_arg, int_arg, page_parser, paginate, pagination_args, parse_body

ns = Namespace("Candidates", description="Candidate profiles, CV upload and HR corrections", path="/", decorators=[hr_endpoint])


class CandidateIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)


class CorrectionsIn(BaseModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=50)
    location: str | None = Field(default=None, max_length=255)
    skills_add: list[str] | None = Field(default=None, max_length=50)
    skills_remove: list[str] | None = Field(default=None, max_length=100)
    total_experience_months: int | None = Field(default=None, ge=0, le=720)
    notes: str | None = Field(default=None, max_length=4000)


_SKILL_SEARCH = text(
    "EXISTS (SELECT 1 FROM ti_documents d, jsonb_array_elements(COALESCE(d.extraction->'skills', '[]'::jsonb)) sk "
    "WHERE d.candidate_id = ti_candidates.id AND (sk->>'normalized' ILIKE :term OR sk->>'original' ILIKE :term)) "
    "OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(ti_candidates.corrections->'skills_add', '[]'::jsonb)) hs "
    "WHERE hs ILIKE :term)"
)

list_parser = page_parser()
for name, help_text in (("q", "Search name, email or skill"), ("job_id", "Filter by job"), ("stage", "Application stage"),
                        ("min_score", "Minimum match score"), ("max_score", "Maximum match score"),
                        ("doc_status", "CV processing status")):
    list_parser.add_argument(name, location="args", help=help_text)


@ns.route("/candidates")
class Candidates(Resource):
    @ns.expect(list_parser)
    @ns.response(200, "Candidates", s.CandidatePage)
    def get(self):
        """Search and filter candidates (paginated)."""
        page, size = pagination_args()
        q = Candidate.query
        term = (request.args.get("q") or "").strip()
        if term:
            like = f"%{term}%"
            q = q.filter(or_(Candidate.full_name.ilike(like), Candidate.email.ilike(like),
                             Candidate.corrections["full_name"].astext.ilike(like),
                             _SKILL_SEARCH.bindparams(term=like)))
        job_id, stage = int_arg("job_id"), request.args.get("stage")
        min_score, max_score = float_arg("min_score"), float_arg("max_score")
        conds = []
        if job_id:
            conds.append(Application.job_id == job_id)
        if stage:
            conds.append(Application.stage == stage)
        if min_score is not None:
            conds.append(Application.match_score >= min_score)
        if max_score is not None:
            conds.append(Application.match_score <= max_score)
        if conds:
            q = q.filter(Candidate.applications.any(db.and_(*conds)))
        if request.args.get("doc_status"):
            q = q.filter(exists(select(Document.id).where(Document.candidate_id == Candidate.id,
                                                          Document.status == request.args["doc_status"])))
        q = q.order_by(Candidate.created_at.desc())
        return paginate(q, serializers.candidate_summary, page, size)

    @ns.expect(s.CandidateCreate)
    @ns.response(201, "Created", s.Candidate)
    def post(self):
        """Create a candidate manually (without a CV)."""
        body = parse_body(CandidateIn)
        candidate = Candidate(full_name=body.full_name.strip(), email=str(body.email).lower() if body.email else None,
                              phone=body.phone)
        db.session.add(candidate)
        db.session.flush()
        audit.record("candidate.created", "candidate", candidate.id)
        db.session.commit()
        return serializers.candidate_detail(candidate), 201


upload_parser = ns.parser()
upload_parser.add_argument("file", location="files", type="file", required=True, help="CV in PDF or DOCX (max 10 MB)")
upload_parser.add_argument("job_id", location="form", type=int, required=True, help="Job to apply for")


@ns.route("/candidates/upload")
class CandidateUpload(Resource):
    @ns.doc(consumes=["multipart/form-data"])
    @ns.expect(upload_parser)
    @ns.response(202, "Accepted; CV queued for NLP processing", s.UploadResponse)
    @ns.response(400, "Invalid file", s.Error)
    @ns.response(413, "File too large", s.Error)
    def post(self):
        """Create a candidate and application from a CV. Name and contacts are filled from extraction."""
        file = request.files.get("file")
        job_id = request.form.get("job_id", type=int)
        if file is None or not file.filename:
            raise bad_request("A CV file is required (field 'file').")
        job = db.session.get(Job, job_id) if job_id else None
        if job is None:
            raise bad_request("A valid job_id is required.")
        if job.status == "closed":
            raise bad_request("This job is closed and no longer accepts applications.", code="job_closed")
        data = file.read()
        # Records are only flushed here; create_document validates the file first and the whole
        # transaction is rolled back if the file is rejected.
        candidate = Candidate(full_name=f"Processing {file.filename[:200]}", name_pending=True)
        db.session.add(candidate)
        db.session.flush()
        application = Application(candidate_id=candidate.id, job_id=job.id, stage="applied")
        db.session.add(application)
        db.session.flush()
        db.session.add(StageHistory(application_id=application.id, to_stage="applied", changed_by_id=current_actor().id,
                                    note="Created from CV upload."))
        audit.record("candidate.created_from_upload", "candidate", candidate.id, {"job_id": job.id})
        try:
            doc, _ = documents.create_document(application, file.filename, data, current_actor().id)
        except ApiError:
            db.session.rollback()
            raise
        db.session.refresh(candidate)
        db.session.refresh(application)
        return {
            "candidate": serializers.candidate_detail(candidate),
            "application": serializers.application(application),
            "document": serializers.document_info(doc),
        }, 202


@ns.route("/candidates/<int:candidate_id>")
class CandidateItem(Resource):
    @ns.response(200, "Candidate with effective profile (AI extraction + HR corrections)", s.Candidate)
    @ns.response(404, "Not found", s.Error)
    def get(self, candidate_id: int):
        """Get a candidate's profile, applications and documents."""
        return serializers.candidate_detail(ensure_candidate(db.session.get(Candidate, candidate_id)))

    @ns.response(204, "Deleted")
    @ns.response(403, "Reviewers cannot delete candidates", s.Error)
    @ns.response(404, "Not found", s.Error)
    def delete(self, candidate_id: int):
        """Permanently delete a candidate and all their data: applications, CV files, screening results, HR
        reviews, stage history, AI interviews (messages, evaluations) and interview emails. Cannot be undone.
        Open interview links stop working immediately. The audit log keeps only ids and counts."""
        candidate = db.session.get(Candidate, candidate_id)
        if candidate is None:
            raise not_found("Candidate")
        purge = deletion.purge_candidate(candidate)
        audit.record("candidate.deleted", "candidate", candidate_id, {"candidate_id": candidate_id, **purge.counts()})
        db.session.commit()
        deletion.remove_files(purge.storage_keys)
        return "", 204


@ns.route("/candidates/<int:candidate_id>/corrections")
class CandidateCorrections(Resource):
    @ns.expect(s.Corrections)
    @ns.response(200, "Updated", s.Candidate)
    def patch(self, candidate_id: int):
        """Save HR corrections. They are stored separately from the AI extraction (which is never modified).
        Send a field as null to clear that correction."""
        candidate = ensure_candidate(db.session.get(Candidate, candidate_id))
        body = parse_body(CorrectionsIn).model_dump(exclude_unset=True)
        corrections = dict(candidate.corrections or {})
        for key, value in body.items():
            if value is None or value == "" or value == []:
                corrections.pop(key, None)
            else:
                corrections[key] = str(value) if key == "email" else value
        candidate.corrections = corrections
        audit.record("candidate.corrected", "candidate", candidate.id, {"fields": sorted(body.keys())})
        db.session.commit()
        return serializers.candidate_detail(candidate)
