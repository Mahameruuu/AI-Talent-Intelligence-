from __future__ import annotations

import hashlib
import json
import re

from ..errors import conflict
from ..extensions import db
from ..models import Application, Document, ScreeningResult, StageHistory
from ..nlp import matching
from ..nlp.pipeline import PIPELINE_VERSION
from . import audit, serializers
from .profile import effective_profile


def latest_document(application: Application) -> Document | None:
    return application.documents[0] if application.documents else None


def latest_completed(application: Application) -> Document | None:
    docs = [d for d in application.documents if d.status == "completed"]
    return max(docs, key=lambda d: d.processed_at or d.created_at) if docs else None


def _names_match(a: str, b: str) -> bool:
    """Lenient: same person if they share at least one name token of 3+ letters (handles order, middle names)."""
    tokens = lambda s: {t for t in re.findall(r"[a-z]{3,}", s.lower())}  # noqa: E731
    return bool(tokens(a) & tokens(b))


def document_flags(doc: Document, profile: dict) -> list[dict]:
    flags = []
    ext = doc.extraction or {}
    if doc.ocr_used:
        flags.append({"code": "ocr_used", "severity": "warning",
                      "message": "Text was obtained via OCR; verify extracted values against the original document."})
    if (doc.methods or {}).get("llm", "").startswith("failed"):
        flags.append({"code": "llm_unavailable", "severity": "info",
                      "message": "LLM-assisted extraction failed; results are from the rule-based pipeline only."})
    if ext.get("name", {}).get("value") is None and not (doc.candidate.corrections or {}).get("full_name"):
        flags.append({"code": "name_not_found", "severity": "warning", "message": "Candidate name was not found in the CV."})
    # Applicants type their contact details into the public form; warn when the CV says otherwise
    # (wrong file uploaded, or someone else's CV).
    if doc.application.source == "public_form":
        cv_email = (ext.get("email", {}).get("value") or "").lower()
        cv_name = ext.get("name", {}).get("value") or ""
        form_email = (doc.candidate.email or "").lower()
        if cv_email and form_email and cv_email != form_email:
            flags.append({"code": "contact_mismatch", "severity": "warning",
                          "message": f"Email in the CV ({cv_email}) differs from the email entered in the application "
                                     f"form ({form_email}). Check that the right CV was uploaded."})
        if cv_name and not _names_match(cv_name, doc.candidate.full_name):
            flags.append({"code": "name_mismatch", "severity": "warning",
                          "message": f"Name in the CV (\"{cv_name}\") differs from the name entered in the application "
                                     f"form (\"{doc.candidate.full_name}\"). Check that the right CV was uploaded."})
    sections = ext.get("sections_detected", [])
    if len(sections) < 2:
        flags.append({"code": "low_structure", "severity": "warning",
                      "message": "Few CV sections were recognised; extraction may be incomplete. Check the evidence viewer."})
    unrecognized = [s["original"] for s in profile.get("skills", []) if not s.get("in_taxonomy", True)]
    if unrecognized:
        flags.append({"code": "unrecognized_skills", "severity": "info",
                      "message": f"{len(unrecognized)} listed skill(s) are not in the taxonomy and were not normalized: "
                                 f"{', '.join(unrecognized[:6])}{'…' if len(unrecognized) > 6 else ''}."})
    return flags


def run_screening(application: Application, *, force: bool = False, document: Document | None = None,
                  actor_label: str | None = None) -> ScreeningResult:
    doc = document or latest_completed(application)
    if doc is None:
        raise conflict("This application has no successfully processed CV to screen.", code="no_processed_cv")

    candidate = application.candidate
    criteria = serializers.job_criteria(application.job)
    corrections_fp = hashlib.sha256(json.dumps(candidate.corrections or {}, sort_keys=True).encode()).hexdigest()[:16]
    chash = hashlib.sha256((matching.criteria_hash(criteria) + corrections_fp + PIPELINE_VERSION).encode()).hexdigest()

    if not force:
        existing = (ScreeningResult.query
                    .filter_by(application_id=application.id, document_id=doc.id, criteria_hash=chash)
                    .order_by(ScreeningResult.created_at.desc()).first())
        if existing:
            return existing

    profile = effective_profile(candidate, doc)
    outcome = matching.screen(criteria, profile, doc.clean_text or "", doc.sections or [], document_flags(doc, profile),
                              form_answers=application.form_answers)
    methods = {**(doc.methods or {}), "embeddings": outcome["semantic_backend"],
               "scoring": "weighted components with renormalisation of non-computable components"}
    result = ScreeningResult(
        application_id=application.id,
        document_id=doc.id,
        status="completed",
        overall_score=outcome["overall_score"],
        components=outcome["components"],
        requirements=outcome["requirements"],
        experience_summary=outcome["experience_summary"],
        flags=outcome["flags"],
        pipeline_version=PIPELINE_VERSION,
        methods=methods,
        criteria_hash=chash,
    )
    db.session.add(result)
    application.match_score = outcome["overall_score"]
    if application.stage == "applied":
        db.session.add(StageHistory(application_id=application.id, from_stage="applied", to_stage="screening",
                                    note="CV screened automatically."))
        application.stage = "screening"
    db.session.flush()
    audit.record("screening.completed", "application", application.id,
                 {"screening_id": result.id, "overall_score": result.overall_score}, actor_label=actor_label)
    db.session.commit()
    return result
