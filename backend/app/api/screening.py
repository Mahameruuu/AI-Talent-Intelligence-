from __future__ import annotations

from flask import request
from flask_restx import Namespace, Resource
from pydantic import BaseModel

from ..errors import not_found
from ..extensions import db
from ..models import Application, HRReview, ScreeningResult
from ..security import current_actor, hr_endpoint
from ..services import serializers
from ..services.screening import latest_document, run_screening
from . import schemas as s
from .common import ensure_application, float_arg, int_arg, page_parser, paginate, pagination_args

ns = Namespace("Screening", description="Explainable CV screening against job criteria", path="/", decorators=[hr_endpoint])


class ScreeningIn(BaseModel):
    force: bool = False


@ns.route("/applications/<int:application_id>/screening")
class ApplicationScreening(Resource):
    @ns.expect(s.ScreeningRun)
    @ns.response(201, "Screening result", s.Screening)
    @ns.response(202, "CV still processing; screening will run automatically when it finishes")
    @ns.response(409, "No processed CV", s.Error)
    def post(self, application_id: int):
        """Run screening for an application. Identical inputs (same CV, criteria and corrections) return the
        existing result unless `force` is true. Never rejects candidates automatically."""
        application = ensure_application(db.session.get(Application, application_id))
        data = request.get_json(silent=True) or {}
        force = bool(ScreeningIn.model_validate(data if isinstance(data, dict) else {}).force)
        doc = latest_document(application)
        if doc is not None and doc.status in ("queued", "processing"):
            return {"status": "pending_document", "document": serializers.document_info(doc)}, 202
        result = run_screening(application, force=force)
        return serializers.screening(result), 201

    @ns.response(200, "Latest screening result", s.Screening)
    @ns.response(404, "No screening yet", s.Error)
    def get(self, application_id: int):
        """Get the latest screening result with requirement evidence and HR validations."""
        application = ensure_application(db.session.get(Application, application_id))
        if not application.screenings:
            raise not_found("Screening result")
        return serializers.screening(application.screenings[0])


parser = page_parser()
parser.add_argument("job_id", type=int, location="args")
parser.add_argument("min_score", type=float, location="args")
parser.add_argument("max_score", type=float, location="args")
parser.add_argument("reviewed", location="args", choices=("true", "false"))


@ns.route("/screenings")
class Screenings(Resource):
    @ns.expect(parser)
    @ns.response(200, "Latest screening per application", s.ScreeningPage)
    def get(self):
        """List the latest screening result of each application, highest score first."""
        page, size = pagination_args()
        latest_ids = (db.session.query(db.func.max(ScreeningResult.id))
                      .group_by(ScreeningResult.application_id).scalar_subquery())
        q = ScreeningResult.query.join(Application).filter(ScreeningResult.id.in_(latest_ids))
        if job_id := int_arg("job_id"):
            q = q.filter(Application.job_id == job_id)
        if (lo := float_arg("min_score")) is not None:
            q = q.filter(ScreeningResult.overall_score >= lo)
        if (hi := float_arg("max_score")) is not None:
            q = q.filter(ScreeningResult.overall_score <= hi)
        reviewed = request.args.get("reviewed")
        if reviewed in ("true", "false"):
            has_review = Application.reviews.any(HRReview.id.isnot(None))
            q = q.filter(has_review if reviewed == "true" else ~has_review)
        q = q.order_by(db.func.coalesce(ScreeningResult.overall_score, -1).desc(), ScreeningResult.id.desc())
        return paginate(q, serializers.screening_list_item, page, size)
