"""Model -> JSON dictionaries matching ``frontend/src/types/api.ts``."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from ..extensions import db
from ..models import (
    Application,
    Candidate,
    Document,
    HRReview,
    InterviewEvaluation,
    InterviewMessage,
    InterviewSession,
    InterviewTemplate,
    Job,
    ScreeningResult,
)
from . import auto_invite, job_period, scoring_settings
from .profile import effective_profile, latest_completed_document


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def job(j: Job, candidate_count: int | None = None) -> dict:
    comps = j.competencies
    return {
        "id": j.id,
        "title": j.title,
        "department": j.department,
        "location": j.location,
        "description": j.description,
        "required_skills": [c.name for c in comps if c.kind == "required_skill"],
        "preferred_skills": [c.name for c in comps if c.kind == "preferred_skill"],
        "min_experience_years": j.min_experience_years,
        "education_level": j.education_level,
        "education_field": j.education_field,
        "required_certifications": [c.name for c in comps if c.kind == "certification"],
        "status": j.status,
        "employment_type": j.employment_type,
        "salary_min": j.salary_min,
        "salary_max": j.salary_max,
        "salary_visible": j.salary_visible,
        "opens_on": j.opens_on.isoformat() if j.opens_on else None,
        "closes_on": j.closes_on.isoformat() if j.closes_on else None,
        "application_window": job_period.window(j),
        "days_left": job_period.days_left(j),
        # Organisation-wide weights (Settings), identical for every job.
        "weights": scoring_settings.get_weights(),
        "is_demo": j.is_demo,
        "candidate_count": candidate_count if candidate_count is not None else len(j.applications),
        "auto_invite": auto_invite.summary(j),
        "created_at": iso(j.created_at),
        "updated_at": iso(j.updated_at),
    }


def job_criteria(j: Job) -> dict:
    data = job(j, candidate_count=0)
    return {k: data[k] for k in ("title", "description", "required_skills", "preferred_skills", "min_experience_years",
                                 "education_level", "education_field", "required_certifications", "weights")}


def document_info(d: Document) -> dict:
    return {
        "id": d.id,
        "application_id": d.application_id,
        "candidate_id": d.candidate_id,
        "filename": d.filename,
        "mime_type": d.mime_type,
        "size_bytes": d.size_bytes,
        "status": d.status,
        "error_code": d.error_code,
        "error_message": d.error_message,
        "page_count": d.page_count,
        "ocr_used": d.ocr_used,
        "pipeline_version": d.pipeline_version,
        "steps": d.steps or [],
        "processing_ms": d.processing_ms,
        "created_at": iso(d.created_at),
        "processed_at": iso(d.processed_at),
    }


def document_detail(d: Document) -> dict:
    return {
        **document_info(d),
        "extraction": d.extraction,
        "clean_text": d.clean_text,
        "sections": d.sections or [],
        "methods": d.methods or {"ner": "n/a", "skills": "n/a", "embeddings": "n/a", "llm": "n/a"},
    }


def _application_brief(a: Application) -> dict:
    return {"id": a.id, "job_id": a.job_id, "job_title": a.job.title, "stage": a.stage, "match_score": a.match_score}


def candidate_summary(c: Candidate) -> dict:
    profile = effective_profile(c, latest_completed_document(c))
    latest_doc = c.documents[0] if c.documents else None
    scores = [a.match_score for a in c.applications if a.match_score is not None]
    return {
        "id": c.id,
        "full_name": profile["full_name"],
        "email": profile["email"],
        "phone": profile["phone"],
        "top_skills": [s["normalized"] for s in profile["skills"] if s.get("in_taxonomy", True)][:6],
        "latest_document_status": latest_doc.status if latest_doc else None,
        "best_match_score": max(scores) if scores else None,
        "applications": [_application_brief(a) for a in c.applications],
        "is_demo": c.is_demo,
        "created_at": iso(c.created_at),
    }


def candidate_detail(c: Candidate) -> dict:
    profile = effective_profile(c, latest_completed_document(c))
    return {
        **candidate_summary(c),
        "location": profile["location"],
        "skills": [{"name": s["normalized"], "source": s["source"]} for s in profile["skills"]],
        "education": profile["education"],
        "experience": profile["experience"],
        "total_experience_months": profile["total_experience_months"],
        "corrections": c.corrections or {},
        "documents": [document_info(d) for d in c.documents],
    }


def stage_history(a: Application) -> list[dict]:
    return [{
        "from_stage": h.from_stage,
        "to_stage": h.to_stage,
        "changed_by": h.changed_by.full_name if h.changed_by else "system",
        "note": h.note,
        "created_at": iso(h.created_at),
    } for h in a.stage_history]


def knockout_failed(s: ScreeningResult) -> bool:
    """True when a must-have (knockout) screening question was not met."""
    return any(r.get("knockout") and r["status"] != "matched"
               for r in s.requirements if r["category"] == "screening_question")


def _screening_summary(s: ScreeningResult | None) -> dict | None:
    """Compact screening outcome for application lists."""
    if s is None:
        return None
    required = [r for r in s.requirements if r["category"] == "required_skill"]
    questions = [r for r in s.requirements if r["category"] == "screening_question"]
    return {
        "overall_score": s.overall_score,
        "required_matched": sum(1 for r in required if r["status"] == "matched"),
        "required_total": len(required),
        "needs_review": sum(1 for r in s.requirements if r["status"] == "needs_review"),
        "screening_met": sum(1 for r in questions if r["status"] == "matched"),
        "screening_total": len(questions),
        "knockout_failed": knockout_failed(s),
        "flags": len(s.flags),
    }


def has_completed_interview(a: Application) -> bool:
    return db.session.query(InterviewSession.query.filter_by(application_id=a.id, status="completed").exists()).scalar()


def application(a: Application) -> dict:
    latest_doc = a.documents[0] if a.documents else None
    latest_screening = a.screenings[0] if a.screenings else None
    profile_name = (a.candidate.corrections or {}).get("full_name") or a.candidate.full_name
    return {
        "id": a.id,
        "candidate_id": a.candidate_id,
        "candidate_name": profile_name,
        "candidate_email": (a.candidate.corrections or {}).get("email") or a.candidate.email,
        "job_id": a.job_id,
        "job_title": a.job.title,
        "stage": a.stage,
        "match_score": a.match_score,
        "latest_document": document_info(latest_doc) if latest_doc else None,
        "latest_screening_id": latest_screening.id if latest_screening else None,
        "screening_summary": _screening_summary(latest_screening),
        "stage_history": stage_history(a),
        "source": a.source,
        "form_answers": a.form_answers or [],
        "submitted_at": iso(a.submitted_at),
        "decision": a.decision,
        "decision_note": a.decision_note,
        "decided_at": iso(a.decided_at),
        "decided_by": a.decided_by.full_name if a.decided_by else None,
        "has_completed_interview": has_completed_interview(a),
        "is_demo": a.is_demo,
        "created_at": iso(a.created_at),
    }


def review(r: HRReview) -> dict:
    return {
        "id": r.id,
        "application_id": r.application_id,
        "screening_result_id": r.screening_result_id,
        "reviewer_id": r.reviewer_id,
        "reviewer_name": r.reviewer.full_name,
        "notes": r.notes,
        "recommendation": r.recommendation,
        "evidence_validations": r.evidence_validations or {},
        "created_at": iso(r.created_at),
    }


def screening(s: ScreeningResult, include_reviews: bool = True) -> dict:
    reviews = [r for r in s.application.reviews] if include_reviews else []
    # Latest validation per requirement key wins (reviews are ordered newest first).
    validations: dict[str, str] = {}
    for r in reversed(reviews):
        validations.update(r.evidence_validations or {})
    requirements = [{**req, "hr_validation": validations.get(req["key"])} for req in s.requirements]
    return {
        "id": s.id,
        "application_id": s.application_id,
        "document_id": s.document_id,
        "status": s.status,
        "overall_score": s.overall_score,
        "components": s.components,
        "requirements": requirements,
        "experience_summary": s.experience_summary,
        "flags": s.flags,
        "pipeline_version": s.pipeline_version,
        "methods": s.methods,
        "created_at": iso(s.created_at),
        "reviews": [review(r) for r in reviews],
    }


def screening_list_item(s: ScreeningResult) -> dict:
    a = s.application
    return {
        **screening(s),
        "candidate_id": a.candidate_id,
        "candidate_name": (a.candidate.corrections or {}).get("full_name") or a.candidate.full_name,
        "job_id": a.job_id,
        "job_title": a.job.title,
        "stage": a.stage,
    }


def template(t: InterviewTemplate) -> dict:
    return {
        "id": t.id,
        "job_id": t.job_id,
        "job_title": t.job.title,
        "name": t.name,
        "language": t.language,
        "mode": t.mode or "template",
        "cv_questions": t.cv_questions,
        "competencies": t.competencies,
        "questions": t.questions,
        "num_questions": t.num_questions,
        "duration_minutes": t.duration_minutes,
        "follow_up_rules": t.follow_up_rules,
        "invitation_expiry_hours": t.invitation_expiry_hours,
        "status": t.status,
        "approved_by": t.approved_by.full_name if t.approved_by else None,
        "created_at": iso(t.created_at),
        "updated_at": iso(t.updated_at),
    }


def message(m: InterviewMessage) -> dict:
    return {"id": m.id, "role": m.role, "content": m.content, "question_id": m.question_id,
            "competency": m.competency, "is_follow_up": m.is_follow_up, "input_mode": m.input_mode,
            "mode_used": m.mode_used, "created_at": iso(m.created_at)}


def email_log(e) -> dict:
    return {"id": e.id, "to_email": e.to_email, "subject": e.subject, "status": e.status, "error": e.error,
            "kind": e.kind, "session_id": e.session_id, "created_at": iso(e.created_at)}


def interview_session(s: InterviewSession, include_messages: bool = True) -> dict:
    from .interviews import (effective_status, latest_email, questions_answered, session_language, session_mode,
                             session_questions)

    a = s.application
    latest_eval = s.evaluations[0] if s.evaluations else None
    return {
        "id": s.id,
        "application_id": s.application_id,
        "candidate_name": (a.candidate.corrections or {}).get("full_name") or a.candidate.full_name,
        "job_title": a.job.title,
        "template_id": s.template_id,
        "template_name": s.template_snapshot.get("name", ""),
        "status": effective_status(s),
        "expires_at": iso(s.expires_at),
        "started_at": iso(s.started_at),
        "completed_at": iso(s.completed_at),
        "language": session_language(s),
        "mode": session_mode(s),
        "questions": [{"id": q["id"], "competency": q["competency"], "text": q["text"],
                       "source": "cv" if str(q["id"]).startswith("cv") else "template",
                       "cv_basis": q.get("cv_basis"), "cv_basis_line": q.get("cv_basis_line")}
                      for q in session_questions(s)],
        "questions_total": len(session_questions(s)),
        "questions_answered": questions_answered(s),
        "invitation_email": email_log(latest) if (latest := latest_email(s)) else None,
        "messages": [message(m) for m in s.messages] if include_messages else [],
        "evaluation_status": latest_eval.status if latest_eval else None,
        "application_stage": a.stage,
        "application_decision": a.decision,
        "application_has_completed_interview": has_completed_interview(a),
        "created_at": iso(s.created_at),
    }


def evaluation(e: InterviewEvaluation) -> dict[str, Any]:
    return {
        "id": e.id,
        "session_id": e.session_id,
        "status": e.status,
        "method": e.method,
        "overall_score": e.overall_score,
        "overall_summary": e.overall_summary,
        "competencies": e.competencies,
        "unanswered_areas": e.unanswered_areas,
        "error_message": e.error_message,
        "reviewer_notes": e.reviewer_notes,
        "reviewed_by": e.reviewed_by.full_name if e.reviewed_by else None,
        "reviewed_at": iso(e.reviewed_at),
        "created_at": iso(e.created_at),
    }
