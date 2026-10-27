from __future__ import annotations

import json
from datetime import datetime, timezone

from flask import request
from flask_restx import Namespace, Resource, fields

from ..errors import bad_request, conflict, not_found
from ..extensions import db
from ..models import ApplicationForm, Job
from ..security import hr_endpoint
from ..services import audit, forms
from . import schemas as s

ns = Namespace("Application Forms", description="Configurable application forms per job and their public links (HR)",
               path="/", decorators=[hr_endpoint])
public_ns = Namespace("Public Application", description="Public endpoints used by applicants (no login)", path="/")

FormField = ns.model("FormField", {
    "id": fields.String(example="f_domicile"),
    "label": fields.String(required=True, example="Current city of residence"),
    "type": fields.String(required=True, enum=sorted(forms.FIELD_TYPES), example="short_text"),
    "required": fields.Boolean(example=True),
    "help_text": fields.String(example=None),
    "placeholder": fields.String(example="e.g. Jakarta"),
    "options": fields.List(fields.String, example=[]),
    "max_length": fields.Integer(example=None),
})
FormInput = ns.model("ApplicationFormInput", {
    "title": fields.String(example="Apply: Data Scientist"),
    "intro": fields.String(example="Thanks for your interest! The form takes about 5 minutes."),
    "fields": fields.List(fields.Nested(FormField)),
    "closes_at": fields.DateTime(example=None, description="Optional deadline (ISO 8601)"),
})
Form = ns.inherit("ApplicationForm", FormInput, {
    "id": fields.Integer(), "job_id": fields.Integer(), "job_title": fields.String(),
    "slug": fields.String(example="k3J9xQ2mP0aB"),
    "public_url": fields.String(example="http://localhost:5173/apply/k3J9xQ2mP0aB"),
    "built_in_fields": fields.List(fields.Nested(FormField)),
    "status": fields.String(enum=["draft", "published", "closed"]),
    "accepting_applications": fields.Boolean(), "published_at": fields.DateTime(),
    "job_opens_on": fields.Date(), "job_closes_on": fields.Date(),
    "job_opens_time": fields.String(example="09:00", description="HH:MM WIB or null"),
    "job_closes_time": fields.String(example="17:00", description="HH:MM WIB or null (end of day)"),
    "job_opens_at": fields.String(example="2026-11-01T09:00:00+07:00"),
    "job_closes_at": fields.String(example="2026-11-30T17:00:00+07:00"),
    "submission_count": fields.Integer(example=12), "created_at": fields.DateTime(), "updated_at": fields.DateTime(),
})
PublicForm = public_ns.model("PublicApplicationForm", {
    "slug": fields.String(), "title": fields.String(), "intro": fields.String(), "company_name": fields.String(),
    "job": fields.Raw(example={"title": "Data Scientist", "location": "Jakarta", "required_skills": ["Python"],
                               "opens_on": "2026-11-01", "closes_on": "2026-11-30", "opens_time": None,
                               "closes_time": "17:00", "opens_at": "2026-11-01T00:00:00+07:00",
                               "closes_at": "2026-11-30T17:00:00+07:00"}),
    "built_in_fields": fields.List(fields.Nested(FormField)), "fields": fields.List(fields.Nested(FormField)),
    "accepting_applications": fields.Boolean(), "closes_at": fields.DateTime(), "max_upload_mb": fields.Integer(),
    "privacy_notice": fields.String(),
})
SubmitResult = public_ns.model("ApplicationSubmitted", {
    "reference": fields.String(example="APP-000123"),
    "message": fields.String(example="Thank you! Your application has been received."),
})


def _job(job_id: int) -> Job:
    job = db.session.get(Job, job_id)
    if job is None:
        raise not_found("Job")
    return job


def _form_of(job_id: int) -> ApplicationForm:
    form = ApplicationForm.query.filter_by(job_id=_job(job_id).id).first()
    if form is None:
        raise not_found("Application form")
    return form


def _parse_closes_at(value) -> datetime | None:
    if value in (None, ""):
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise bad_request("'closes_at' must be an ISO 8601 date-time.") from exc
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


@ns.route("/forms")
class Forms(Resource):
    @ns.response(200, "All application forms with submission counts", [Form])
    def get(self):
        """List application forms (one per job)."""
        return [forms.form_dict(f) for f in ApplicationForm.query.order_by(ApplicationForm.updated_at.desc()).all()]


@ns.route("/jobs/<int:job_id>/form")
class JobForm(Resource):
    @ns.response(200, "Form", Form)
    @ns.response(404, "No form yet", s.Error)
    def get(self, job_id: int):
        """Get the job's application form."""
        return forms.form_dict(_form_of(job_id))

    @ns.response(201, "Created as draft with suggested fields", Form)
    @ns.response(409, "Form already exists", s.Error)
    def post(self, job_id: int):
        """Create the job's application form (draft) with suggested custom fields."""
        job = _job(job_id)
        if ApplicationForm.query.filter_by(job_id=job.id).first():
            raise conflict("This job already has an application form.", code="form_exists")
        form = ApplicationForm(job_id=job.id, slug=forms.new_slug(), title=f"Apply: {job.title}",
                               intro=None, fields=forms.default_fields(), status="draft")
        db.session.add(form)
        db.session.flush()
        audit.record("form.created", "application_form", form.id, {"job_id": job.id})
        db.session.commit()
        return forms.form_dict(form), 201

    @ns.expect(FormInput)
    @ns.response(200, "Saved", Form)
    @ns.response(400, "Invalid field definitions", s.Error)
    def put(self, job_id: int):
        """Save the form's title, intro, custom fields and deadline. Name, email, phone and CV are always
        included. Changes to a published form apply to new applications immediately; earlier answers keep
        the labels they were submitted with."""
        form = _form_of(job_id)
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            raise bad_request("Request body must be a JSON object.")
        if "title" in data:
            title = str(data.get("title") or "").strip()
            if not 2 <= len(title) <= 255:
                raise bad_request("Title must be 2-255 characters.")
            form.title = title
        if "intro" in data:
            form.intro = (str(data["intro"]).strip()[:4000] or None) if data["intro"] else None
        if "fields" in data:
            form.fields = forms.validate_fields(data["fields"])
        if "closes_at" in data:
            form.closes_at = _parse_closes_at(data["closes_at"])
        audit.record("form.updated", "application_form", form.id)
        db.session.commit()
        return forms.form_dict(form)


def _set_status(job_id: int, status: str) -> dict:
    form = _form_of(job_id)
    if status == "published":
        if form.job.status == "closed":
            raise conflict("Reopen the job before publishing its application form.", code="job_closed")
        form.published_at = form.published_at or datetime.now(timezone.utc)
    form.status = status
    audit.record(f"form.{status}", "application_form", form.id)
    db.session.commit()
    return forms.form_dict(form)


@ns.route("/jobs/<int:job_id>/form/publish")
class PublishForm(Resource):
    @ns.response(200, "Published; the public link accepts applications", Form)
    def post(self, job_id: int):
        """Publish the form so the public link accepts applications."""
        return _set_status(job_id, "published")


@ns.route("/jobs/<int:job_id>/form/close")
class CloseForm(Resource):
    @ns.response(200, "Closed; the public link shows that applications are closed", Form)
    def post(self, job_id: int):
        """Stop accepting applications."""
        return _set_status(job_id, "closed")


@ns.route("/jobs/<int:job_id>/form/regenerate-link")
class RegenerateLink(Resource):
    @ns.response(200, "New link; the old link stops working", Form)
    def post(self, job_id: int):
        """Replace the public link (e.g. if it was shared somewhere it shouldn't be)."""
        form = _form_of(job_id)
        form.slug = forms.new_slug()
        audit.record("form.link_regenerated", "application_form", form.id)
        db.session.commit()
        return forms.form_dict(form)


# ---------------------------------------------------------------- public


def _public_form(slug: str) -> ApplicationForm:
    form = ApplicationForm.query.filter_by(slug=slug).first() if len(slug) <= 40 else None
    # Draft forms are not visible publicly.
    if form is None or form.status == "draft":
        raise not_found("Application form")
    return form


@public_ns.route("/public/forms/<string:slug>")
class PublicFormItem(Resource):
    @public_ns.response(200, "Form definition and job summary", PublicForm)
    @public_ns.response(404, "Unknown or unpublished form", s.Error)
    def get(self, slug: str):
        """Get a published application form (no login)."""
        return forms.public_form_dict(_public_form(slug))


submit_parser = public_ns.parser()
submit_parser.add_argument("answers", location="form", required=True,
                           help='JSON object: {"full_name": "...", "email": "...", "phone": "...", "<field_id>": value}')
submit_parser.add_argument("consent", location="form", required=True, help='"true" to accept the privacy notice')
submit_parser.add_argument("cv", location="files", type="file", required=True, help="CV in PDF or DOCX (max 10 MB)")


@public_ns.route("/public/forms/<string:slug>/submit")
class PublicFormSubmit(Resource):
    @public_ns.doc(consumes=["multipart/form-data"])
    @public_ns.expect(submit_parser)
    @public_ns.response(201, "Application received", SubmitResult)
    @public_ns.response(400, "Validation errors per field in error.details.fields", s.Error)
    @public_ns.response(409, "Already applied with this email", s.Error)
    @public_ns.response(410, "Form closed", s.Error)
    @public_ns.response(429, "Too many submissions", s.Error)
    def post(self, slug: str):
        """Submit an application (no login). The CV is processed and screened automatically."""
        form = _public_form(slug)
        if request.form.get("website"):  # honeypot: hidden field only bots fill in
            return {"reference": "APP-000000", "message": "Thank you! Your application has been received."}, 201
        forms.check_rate_limit(request.remote_addr or "unknown")
        try:
            answers = json.loads(request.form.get("answers") or "{}")
        except json.JSONDecodeError as exc:
            raise bad_request("'answers' must be a JSON object.") from exc
        if not isinstance(answers, dict):
            raise bad_request("'answers' must be a JSON object.")
        cv = request.files.get("cv")
        application = forms.submit(
            form, answers,
            cv.filename if cv else None, cv.read() if cv else None,
            consent=str(request.form.get("consent", "")).lower() in ("true", "1", "yes", "on"),
        )
        return {"reference": f"APP-{application.id:06d}",
                "message": "Thank you! Your application has been received."}, 201

