from __future__ import annotations

from flask_restx import Namespace, Resource, fields
from sqlalchemy import text

from ..extensions import db
from ..llm.adapter import get_llm
from ..models import Document
from ..nlp import semantic
from ..nlp.pipeline import PIPELINE_VERSION
from ..nlp.skills import load_taxonomy
from ..nlp.text_extraction import ocr_available
from ..security import hr_endpoint
from ..services import analytics
from ..worker import worker

ns = Namespace("Analytics & System", description="Recruitment metrics, service status and health", path="/", decorators=[hr_endpoint])

Dashboard = ns.model("Dashboard", {
    "has_data": fields.Boolean(example=True),
    "has_demo_data": fields.Boolean(example=False),
    "kpis": fields.Raw(example={"open_jobs": 3, "total_jobs": 4, "applicants": 42, "applicants_this_week": 9,
                                "interviews_completed": 12, "waiting_for_decision": 4, "hired": 3, "decided": 10,
                                "hire_rate": 30.0}),
    "jobs": fields.Raw(example=[{"job_id": 1, "title": "Data Scientist", "status": "open", "closes_on": "2026-11-01",
                                 "closes_time": "17:00", "closes_at": "2026-11-01T17:00:00+07:00",
                                 "auto_invite_on": "2026-11-02", "auto_invite_at": "2026-11-02T08:00:00+07:00", "applicants": 20, "avg_match_score": 64.2,
                                 "interviewed": 5, "hired": 1}]),
    "attention": fields.Raw(example=[
        {"kind": "decision", "session_id": 7, "application_id": 12, "candidate_name": "Rina Wijaya",
         "job_title": "Data Scientist", "interview_score": 78.0, "completed_at": "2026-10-25T03:00:00+00:00"},
        {"kind": "job_closing", "job_id": 1, "job_title": "Data Scientist", "closes_on": "2026-10-29",
         "closes_time": None, "closes_at": "2026-10-29T23:59:59+07:00", "days_left": 2, "applicants": 20}]),
    "monthly": fields.Raw(example=[{"month": "2026-10", "applicants": 18, "jobs_opened": 2, "interviews_completed": 5,
                                    "hired": 1}]),
})


@ns.route("/analytics/dashboard")
class AnalyticsDashboard(Resource):
    @ns.response(200, "Dashboard metrics", Dashboard)
    def get(self):
        """Everything the dashboard needs in one call: KPIs, monthly trends, jobs overview and attention list."""
        return analytics.dashboard()


@ns.route("/system/status")
class SystemStatus(Resource):
    def get(self):
        """Service status: database, LLM, OCR, embeddings, worker and recent failures."""
        try:
            db.session.execute(text("SELECT 1"))
            database = "ok"
        except Exception:
            database = "error"
        llm = get_llm()
        ocr_ok, ocr_detail = ocr_available()
        embed_backend, embed_detail = semantic.backend_info()
        tax = load_taxonomy()
        failures = Document.query.filter_by(status="failed").order_by(Document.processed_at.desc().nullslast()).limit(10).all()
        return {
            "database": database,
            "llm": {"enabled": llm.enabled, "provider": llm.provider, "model": llm.model,
                    "detail": f"Using {llm.describe()} for CV extraction assistance, interview follow-ups and evaluation."
                    if llm.enabled else "No LLM configured (set LLM_PROVIDER and its API key): rule-based extraction "
                                        "and evidence-only interview evaluation are used."},
            "ocr": {"available": ocr_ok, "detail": ocr_detail},
            "embeddings": {"backend": embed_backend, "detail": embed_detail},
            "ner": {"backend": "rule-based", "detail": "Regex, gazetteers, title/organisation markers and section context (EN/ID)."},
            "skill_taxonomy": {"version": tax.version, "skills": len(tax.skills), "aliases": tax.alias_count},
            "worker": {"max_workers": worker.max_workers, "queued": worker.queued, "running": worker.running},
            "recent_failures": [{"document_id": d.id, "filename": d.filename, "error_code": d.error_code,
                                 "error_message": d.error_message,
                                 "at": (d.processed_at or d.created_at).isoformat()} for d in failures],
            "pipeline_version": PIPELINE_VERSION,
        }


@ns.route("/health")
class Health(Resource):
    def get(self):
        """Liveness check (public)."""
        return {"status": "ok"}
