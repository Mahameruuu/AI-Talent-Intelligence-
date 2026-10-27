"""XORCA Talent Intelligence — Flask application factory."""

from __future__ import annotations

import logging

from flask import Flask, Response, jsonify, redirect, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

from .config import Config
from .extensions import db, migrate


# Security headers (see README "Security headers"). The API only returns JSON/audio, so its CSP blocks everything;
# the Swagger UI page needs its own bundled scripts/styles (plus restx's inline bootstrap script).
API_CSP = "default-src 'none'; frame-ancestors 'none'"
DOCS_CSP = ("default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' "
            "https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; "
            "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
BASELINE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    # Interview links carry the token in the URL fragment; never leak any URL to other sites.
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=(self), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}
DOCS_PATHS = ("/api/v1/talent/docs", "/api/v1/talent/swagger.json", "/swaggerui/")
HSTS_VALUE = "max-age=31536000; includeSubDomains"


def apply_security_headers(response: Response) -> Response:
    """Add the baseline security headers to every response (``after_request``)."""
    from flask import current_app

    headers = response.headers
    for name, value in BASELINE_HEADERS.items():
        headers.setdefault(name, value)
    path = request.path
    is_docs = path.startswith(DOCS_PATHS)
    if is_docs:
        headers.setdefault("Content-Security-Policy", DOCS_CSP)
    else:
        headers.setdefault("Content-Security-Policy", API_CSP)
        if path.startswith("/api/"):
            # Personal data must not be kept by browsers or proxies. Endpoints that set their own policy
            # (e.g. the interviewer audio's short private cache) keep it.
            if "Cache-Control" not in headers:
                headers["Cache-Control"] = "no-store"
                headers.setdefault("Pragma", "no-cache")
    if request.is_secure or current_app.config.get("HSTS_ENABLED"):
        headers.setdefault("Strict-Transport-Security", HSTS_VALUE)
    headers["Server"] = "XORCA"  # don't advertise server software / versions
    return response


class _RedactTokens(logging.Filter):
    """Defence in depth: never let an Authorization or interview token reach the logs."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        if "Bearer " in msg or "X-Interview-Token" in msg:
            record.msg = "[redacted log line containing credentials]"
            record.args = ()
        return True


def create_app(config_object: type[Config] = Config) -> Flask:
    app = Flask(__name__)
    app.config.from_object(config_object)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for handler in logging.getLogger().handlers:
        handler.addFilter(_RedactTokens())

    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app, resources={r"/api/*": {"origins": [app.config["FRONTEND_URL"]]}},
         allow_headers=["Content-Type", "X-Interview-Token", "X-Actor-Name", "X-Actor-Id"])

    from .llm.adapter import init_llm
    from .nlp import semantic

    init_llm(app.config["ANTHROPIC_API_KEY"], app.config["LLM_MODEL"], app.config["LLM_TIMEOUT_SECONDS"],
             provider=app.config["LLM_PROVIDER"], base_url=app.config["LLM_BASE_URL"],
             openai_api_key=app.config["LLM_API_KEY"],
             fallback={"provider": app.config["LLM_FALLBACK_PROVIDER"], "api_key": app.config["LLM_FALLBACK_API_KEY"],
                       "model": app.config["LLM_FALLBACK_MODEL"], "base_url": app.config["LLM_FALLBACK_BASE_URL"]})
    semantic.configure(app.config["EMBEDDING_MODEL"])

    from .worker import worker

    worker.init_app(app)

    from . import models  # noqa: F401  (register models for migrations)
    from .api import blueprint

    app.register_blueprint(blueprint)

    app.after_request(apply_security_headers)

    @app.get("/docs")
    def docs_shortcut():
        """Short URL for the Swagger UI: http://localhost:5001/docs"""
        return redirect("/api/v1/talent/docs")

    @app.errorhandler(HTTPException)
    def http_error(error: HTTPException):
        code = (error.name or "error").lower().replace(" ", "_")
        if error.code == 413:
            code, message = "file_too_large", f"Upload exceeds the {app.config['MAX_UPLOAD_MB']} MB limit."
        else:
            message = error.description or error.name
        return jsonify({"error": {"code": code, "message": message}}), error.code

    from .cli import register_cli

    register_cli(app)

    from .scheduler import scheduler

    scheduler.init_app(app)  # automatic AI-interview invitations (not in tests / when disabled)
    return app


def recover_background_jobs(app: Flask) -> None:
    """Re-queue work interrupted by a restart (documents and evaluations left mid-flight)."""
    from .models import Document, InterviewEvaluation
    from .services.documents import enqueue
    from .services.interviews import enqueue_evaluation

    with app.app_context():
        try:
            stuck_docs = Document.query.filter(Document.status.in_(("queued", "processing"))).all()
            stuck_evals = InterviewEvaluation.query.filter(InterviewEvaluation.status.in_(("pending", "processing"))).all()
        except Exception:  # tables may not exist yet (before `flask db upgrade`)
            return
        for d in stuck_docs:
            d.status = "queued"
        for e in stuck_evals:
            e.status = "pending"
        db.session.commit()
        for d in stuck_docs:
            enqueue(d.id)
        for e in stuck_evals:
            enqueue_evaluation(e.id)
