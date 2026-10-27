from __future__ import annotations

import logging

from flask import Blueprint
from flask_restx import Api
from werkzeug.exceptions import HTTPException

from ..errors import ApiError

log = logging.getLogger(__name__)

blueprint = Blueprint("talent_api", __name__, url_prefix="/api/v1/talent")

api = Api(
    blueprint,
    version="1.0",
    title="XORCA Talent Intelligence API",
    description=(
        "REST API for CV processing (NLP), explainable job matching, AI interviews and recruitment analytics.\n\n"
        "**Authentication: none.** Sign-in and user permissions are handled by the central system. This API must "
        "only be reachable from the central system / its API gateway on a private network — never expose it to the "
        "public internet.\n\n"
        "**Attribution (optional):** send `X-Actor-Name` (and optionally `X-Actor-Id`, free text, max 255 "
        "characters) with HR requests to record who acted in the audit log, stage history, decisions, reviews, "
        "template approvals and settings. Without it the actor is `HR`. These headers are attribution only, never "
        "authorization.\n\n"
        "Candidate interview endpoints use the `X-Interview-Token` header from the invitation link; public "
        "application form endpoints are rate-limited.\n\n"
        "**Errors** use the shape `{\"error\": {\"code\", \"message\", \"details\"}}`.\n\n"
        "Scores express match with job criteria — not a prediction of job success. Final decisions are made by HR."
    ),
    doc="/docs",
    authorizations={
        "InterviewToken": {"type": "apiKey", "in": "header", "name": "X-Interview-Token",
                           "description": "Candidate invitation token (from the invitation link fragment)"},
    },
    catch_all_404s=False,
)


@api.errorhandler(ApiError)
def handle_api_error(error: ApiError):
    return error.to_dict(), error.status


@api.errorhandler(HTTPException)
def handle_http_error(error: HTTPException):
    code = (error.name or "error").lower().replace(" ", "_")
    return {"error": {"code": code, "message": error.description or error.name}}, error.code or 500


@api.errorhandler(Exception)
def handle_unexpected(error: Exception):
    log.exception("Unhandled API error")
    return {"error": {"code": "internal_error", "message": "An unexpected error occurred."}}, 500


from . import schemas  # noqa: E402,F401  (registers shared models)
from .analytics import ns as analytics_ns  # noqa: E402
from .applications import ns as applications_ns  # noqa: E402
from .candidate_interview import ns as candidate_interview_ns  # noqa: E402
from .candidates import ns as candidates_ns  # noqa: E402
from .forms import ns as forms_ns  # noqa: E402
from .forms import public_ns as public_forms_ns  # noqa: E402
from .interviews import ns as interviews_ns  # noqa: E402
from .interviews import templates_ns  # noqa: E402
from .jobs import ns as jobs_ns  # noqa: E402
from .screening import ns as screening_ns  # noqa: E402
from .settings import ns as settings_ns  # noqa: E402

for namespace in (jobs_ns, forms_ns, candidates_ns, applications_ns, screening_ns, templates_ns,
                  interviews_ns, candidate_interview_ns, public_forms_ns, analytics_ns, settings_ns):
    api.add_namespace(namespace)
