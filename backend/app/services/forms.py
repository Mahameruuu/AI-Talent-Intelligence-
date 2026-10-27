"""Public application forms: HR-configurable fields, public link, and applicant submissions.

Built-in fields (always present, always required): full name, email, phone and CV upload. HR adds any
custom fields per job. Submissions create (or reuse, by email) a candidate, create the application, and
queue the CV for the NLP pipeline and automatic screening.
"""

from __future__ import annotations

import re
import secrets
import threading
import time
from collections import defaultdict, deque
from datetime import date, datetime, timezone
from typing import Any

from flask import current_app

from ..errors import ApiError, bad_request, conflict
from ..extensions import db
from ..models import Application, ApplicationForm, Candidate, Job, StageHistory
from . import audit, documents, job_period

FIELD_TYPES = {
    "short_text", "long_text", "email", "phone", "number", "date", "url",
    "select", "multi_select", "checkbox", "yes_no",
}
CHOICE_TYPES = {"select", "multi_select"}
MAX_FIELDS = 30

BUILT_IN_FIELDS = [
    {"id": "full_name", "label": "Full name", "type": "short_text", "required": True, "built_in": True},
    {"id": "email", "label": "Email", "type": "email", "required": True, "built_in": True},
    {"id": "phone", "label": "Phone number", "type": "phone", "required": True, "built_in": True},
    {"id": "cv", "label": "CV (PDF or DOCX, max 10 MB)", "type": "file", "required": True, "built_in": True},
]
BUILT_IN_IDS = {f["id"] for f in BUILT_IN_FIELDS}

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$")
PHONE_RE = re.compile(r"^\+?[\d\s().\-]{8,20}$")
URL_RE = re.compile(r"^https?://[^\s]+\.[^\s]+$", re.IGNORECASE)


FIELD_DEFAULTS = {"help_text": None, "placeholder": None, "options": [], "max_length": None, "screening": None}


def normalized_fields(fields: list[dict]) -> list[dict]:
    """Every custom field with the full key set the API contract promises."""
    return [{**FIELD_DEFAULTS, **f} for f in fields]


def default_fields() -> list[dict]:
    return normalized_fields([
        {"id": "f_domicile", "label": "Current city of residence", "type": "short_text", "required": True,
         "help_text": None, "placeholder": "e.g. Jakarta", "options": []},
        {"id": "f_expected_salary", "label": "Expected monthly salary (IDR)", "type": "number", "required": False,
         "help_text": "Optional.", "placeholder": None, "options": []},
        {"id": "f_notice", "label": "When can you start?", "type": "select", "required": True, "help_text": None,
         "placeholder": None, "options": ["Immediately", "Within 1 month", "1-3 months", "More than 3 months"]},
        {"id": "f_motivation", "label": "Why are you interested in this role?", "type": "long_text", "required": False,
         "help_text": None, "placeholder": None, "options": []},
    ])


def new_slug() -> str:
    return secrets.token_urlsafe(9)


def public_url(form: ApplicationForm) -> str:
    return f"{current_app.config['FRONTEND_URL'].rstrip('/')}/apply/{form.slug}"


def closed_reason(form: ApplicationForm) -> str | None:
    """Why the public form isn't accepting applications, or None when it is."""
    if form.status == "draft":
        return "draft"
    if form.status == "closed" or form.job.status == "closed":
        return "closed"
    if form.job.status == "draft":
        return "job_draft"
    period = job_period.window(form.job)
    if period == "upcoming":
        return "not_yet_open"
    if period == "ended":
        return "deadline_passed"
    if form.closes_at and datetime.now(timezone.utc) > form.closes_at:
        return "deadline_passed"
    return None


def is_accepting(form: ApplicationForm) -> bool:
    return closed_reason(form) is None


def validate_fields(raw: Any) -> list[dict]:
    """Validate HR-defined custom fields."""
    if not isinstance(raw, list):
        raise bad_request("'fields' must be a list.")
    if len(raw) > MAX_FIELDS:
        raise bad_request(f"A form can have at most {MAX_FIELDS} custom fields.")
    out, seen = [], set()
    for i, f in enumerate(raw, start=1):
        if not isinstance(f, dict):
            raise bad_request(f"Field {i} is invalid.")
        label = str(f.get("label") or "").strip()
        ftype = f.get("type")
        if not label or len(label) > 200:
            raise bad_request(f"Field {i} needs a label (max 200 characters).")
        if ftype not in FIELD_TYPES:
            raise bad_request(f"Field '{label}' has an unsupported type '{ftype}'.",
                              {"allowed_types": sorted(FIELD_TYPES)})
        fid = str(f.get("id") or "").strip() or f"f_{secrets.token_hex(4)}"
        if not re.fullmatch(r"[A-Za-z0-9_\-]{1,40}", fid) or fid in BUILT_IN_IDS:
            fid = f"f_{secrets.token_hex(4)}"
        while fid in seen:
            fid = f"f_{secrets.token_hex(4)}"
        seen.add(fid)
        options: list[str] = []
        if ftype in CHOICE_TYPES:
            options = [str(o).strip()[:200] for o in (f.get("options") or []) if str(o).strip()]
            options = list(dict.fromkeys(options))
            if len(options) < 2:
                raise bad_request(f"Field '{label}' needs at least two options.")
        max_length = f.get("max_length")
        out.append({
            "id": fid,
            "label": label,
            "type": ftype,
            "required": bool(f.get("required")),
            "help_text": (str(f["help_text"]).strip()[:500] or None) if f.get("help_text") else None,
            "placeholder": (str(f["placeholder"]).strip()[:200] or None) if f.get("placeholder") else None,
            "options": options,
            "max_length": int(max_length) if isinstance(max_length, int) and 1 <= max_length <= 5000 else None,
            "screening": _validate_screening(f.get("screening"), ftype, options, label),
        })
    return out


SCREENING_TYPES = {"yes_no", "select", "number", "checkbox"}


def _validate_screening(raw: Any, ftype: str, options: list[str], label: str) -> dict | None:
    """Validate a field's screening rule (the expected answer). Returns None when the field isn't scored.

    yes_no: {"expected": "yes"|"no"} · select: {"accepted": [options]} · number: {"min": x, "max": y} ·
    checkbox: must be checked. ``knockout`` marks a must-meet qualification (flagged, never auto-rejected).
    """
    if not isinstance(raw, dict) or not raw.get("enabled"):
        return None
    if ftype not in SCREENING_TYPES:
        raise bad_request(f"'{label}' can't be a screening question; use Yes/No, Dropdown, Number or Checkbox.")
    rule: dict[str, Any] = {"enabled": True, "knockout": bool(raw.get("knockout"))}
    if ftype == "yes_no":
        if raw.get("expected") not in ("yes", "no"):
            raise bad_request(f"Choose the expected answer (Yes or No) for '{label}'.")
        rule["expected"] = raw["expected"]
    elif ftype == "select":
        accepted = [o for o in (raw.get("accepted") or []) if o in options]
        if not accepted:
            raise bad_request(f"Choose at least one accepted option for '{label}'.")
        rule["accepted"] = list(dict.fromkeys(accepted))
    elif ftype == "number":
        bounds = {}
        for key in ("min", "max"):
            value = raw.get(key)
            if value is None or value == "":
                continue
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise bad_request(f"The {key} value for '{label}' must be a number.")
            bounds[key] = value
        if not bounds:
            raise bad_request(f"Set a minimum and/or maximum for '{label}'.")
        if "min" in bounds and "max" in bounds and bounds["max"] < bounds["min"]:
            raise bad_request(f"For '{label}', the maximum can't be lower than the minimum.")
        rule.update(bounds)
    elif ftype == "checkbox":
        rule["expected"] = True
    return rule


def public_fields(fields: list[dict]) -> list[dict]:
    """Fields as shown to applicants: the screening rule (expected answers) is never exposed."""
    return [{k: v for k, v in f.items() if k != "screening"} for f in normalized_fields(fields)]


def _validate_answer(field: dict, value: Any) -> Any:
    """Return the cleaned value or raise ValueError with a user-facing message."""
    empty = value is None or value == "" or value == [] or (field["type"] == "checkbox" and value is False)
    if empty:
        if field["required"]:
            raise ValueError("This field is required.")
        return None
    t = field["type"]
    if t in ("short_text", "long_text"):
        text = str(value).strip()
        limit = field.get("max_length") or (200 if t == "short_text" else 5000)
        if len(text) > limit:
            raise ValueError(f"Maximum {limit} characters.")
        return text
    if t == "email":
        text = str(value).strip().lower()
        if not EMAIL_RE.match(text) or len(text) > 255:
            raise ValueError("Enter a valid email address.")
        return text
    if t == "phone":
        text = str(value).strip()
        if not PHONE_RE.match(text) or not 8 <= len(re.sub(r"\D", "", text)) <= 15:
            raise ValueError("Enter a valid phone number.")
        return text
    if t == "number":
        try:
            number = float(str(value).replace(",", "").strip())
        except ValueError as exc:
            raise ValueError("Enter a number.") from exc
        return int(number) if number.is_integer() else number
    if t == "date":
        try:
            return date.fromisoformat(str(value)).isoformat()
        except ValueError as exc:
            raise ValueError("Enter a valid date (YYYY-MM-DD).") from exc
    if t == "url":
        text = str(value).strip()
        if not URL_RE.match(text) or len(text) > 500:
            raise ValueError("Enter a valid URL starting with http:// or https://.")
        return text
    if t == "select":
        if value not in field["options"]:
            raise ValueError("Choose one of the options.")
        return value
    if t == "multi_select":
        values = value if isinstance(value, list) else [value]
        if any(v not in field["options"] for v in values):
            raise ValueError("Choose from the listed options.")
        return list(dict.fromkeys(values))
    if t == "checkbox":
        return bool(value)
    if t == "yes_no":
        if value not in ("yes", "no", True, False):
            raise ValueError("Answer yes or no.")
        return "yes" if value in ("yes", True) else "no"
    raise ValueError("Unsupported field.")


# ---------------------------------------------------------------- abuse protection

_rate_lock = threading.Lock()
_rate: dict[str, deque] = defaultdict(deque)
WINDOW_SECONDS = 3600


def check_rate_limit(ip: str) -> None:
    # Note: behind a reverse proxy, configure werkzeug's ProxyFix so remote_addr is the real client IP.
    limit, window = current_app.config["FORM_SUBMISSIONS_PER_IP_PER_HOUR"], WINDOW_SECONDS
    now = time.monotonic()
    with _rate_lock:
        hits = _rate[ip]
        while hits and now - hits[0] > window:
            hits.popleft()
        if len(hits) >= limit:
            raise ApiError(429, "rate_limited", "Too many applications from this network. Please try again later.")
        hits.append(now)


def reset_rate_limit() -> None:
    with _rate_lock:
        _rate.clear()


# ---------------------------------------------------------------- submission


def submit(form: ApplicationForm, payload: dict[str, Any], cv_filename: str | None, cv_data: bytes | None,
           consent: bool) -> Application:
    reason = closed_reason(form)
    if reason == "not_yet_open":
        opens = form.job.opens_on.isoformat()
        if form.job.opens_time is not None:
            opens += f" at {job_period.hhmm(form.job.opens_time)} WIB"
        raise ApiError(410, "not_yet_open", f"Applications for this job open on {opens}.")
    if reason == "deadline_passed":
        raise ApiError(410, "deadline_passed", "The application deadline for this job has passed.")
    if reason:
        raise ApiError(410, "form_closed", "This application form is no longer accepting applications.")
    if not consent:
        raise bad_request("You must agree to the privacy notice to apply.", code="consent_required")

    errors: dict[str, str] = {}
    cleaned: dict[str, Any] = {}
    for field in BUILT_IN_FIELDS[:3] + form.fields:
        try:
            cleaned[field["id"]] = _validate_answer({"max_length": None, "options": [], **field}, payload.get(field["id"]))
        except ValueError as exc:
            errors[field["id"]] = str(exc)
    if not cv_data or not cv_filename:
        errors["cv"] = "Please upload your CV."
    if errors:
        raise bad_request("Please correct the highlighted fields.", {"fields": errors})

    job: Job = form.job
    email = cleaned["email"]
    candidate = (Candidate.query.filter(db.func.lower(Candidate.email) == email, Candidate.is_demo.is_(False))
                 .order_by(Candidate.id).first())
    if candidate and Application.query.filter_by(candidate_id=candidate.id, job_id=job.id).first():
        raise conflict("You have already applied for this position with this email address.",
                       code="already_applied")
    if candidate is None:
        candidate = Candidate(full_name=cleaned["full_name"], email=email, phone=cleaned["phone"])
        db.session.add(candidate)
        db.session.flush()
    else:
        # Contact details from the newest form submission are authoritative.
        candidate.full_name = cleaned["full_name"]
        candidate.phone = cleaned["phone"]

    # The screening rule is stored with each answer so later form edits don't change how it was scored.
    answers = [{
        "field_id": f["id"], "label": f["label"], "type": f["type"], "value": cleaned.get(f["id"]),
        "screening": f.get("screening"),
    } for f in form.fields]
    application = Application(
        candidate_id=candidate.id, job_id=job.id, stage="applied", source="public_form", form_id=form.id,
        form_answers=answers, submitted_at=datetime.now(timezone.utc),
    )
    db.session.add(application)
    db.session.flush()
    db.session.add(StageHistory(application_id=application.id, to_stage="applied",
                                note="Submitted via public application form."))
    audit.record("application.submitted", "application", application.id, {"form_id": form.id, "job_id": job.id},
                 actor_label="applicant")
    try:
        # Validates the file, stores it privately, commits, and queues NLP + screening.
        documents.create_document(application, cv_filename, cv_data, uploaded_by_id=None)
    except ApiError as exc:
        db.session.rollback()
        if exc.code in ("unsupported_type", "extension_mismatch", "empty_file", "file_too_large", "invalid_document"):
            raise ApiError(exc.status, exc.code, exc.message, {"fields": {"cv": exc.message}}) from exc
        raise
    return application


def form_dict(form: ApplicationForm) -> dict:
    count = Application.query.filter_by(form_id=form.id).count()
    return {
        "id": form.id,
        "job_id": form.job_id,
        "job_title": form.job.title,
        "slug": form.slug,
        "public_url": public_url(form),
        "title": form.title,
        "intro": form.intro,
        "built_in_fields": BUILT_IN_FIELDS,
        "fields": normalized_fields(form.fields),
        "status": form.status,
        "accepting_applications": is_accepting(form),
        "closed_reason": closed_reason(form),
        # The job's application period is the deadline applicants see.
        "job_opens_on": form.job.opens_on.isoformat() if form.job.opens_on else None,
        "job_closes_on": form.job.closes_on.isoformat() if form.job.closes_on else None,
        "job_opens_time": job_period.hhmm(form.job.opens_time),
        "job_closes_time": job_period.hhmm(form.job.closes_time),
        "job_opens_at": job_period.iso(job_period.opens_at(form.job)),
        "job_closes_at": job_period.iso(job_period.closes_at(form.job)),
        "closes_at": form.closes_at.isoformat() if form.closes_at else None,
        "published_at": form.published_at.isoformat() if form.published_at else None,
        "submission_count": count,
        "created_at": form.created_at.isoformat(),
        "updated_at": form.updated_at.isoformat() if form.updated_at else None,
    }


def public_form_dict(form: ApplicationForm) -> dict:
    job = form.job
    comps = job.competencies
    return {
        "slug": form.slug,
        "title": form.title,
        "intro": form.intro,
        "company_name": current_app.config["COMPANY_NAME"],
        "job": {
            "title": job.title,
            "department": job.department,
            "location": job.location,
            "description": job.description,
            "required_skills": [c.name for c in comps if c.kind == "required_skill"],
            "preferred_skills": [c.name for c in comps if c.kind == "preferred_skill"],
            "min_experience_years": job.min_experience_years,
            "opens_on": job.opens_on.isoformat() if job.opens_on else None,
            "closes_on": job.closes_on.isoformat() if job.closes_on else None,
            "opens_time": job_period.hhmm(job.opens_time),
            "closes_time": job_period.hhmm(job.closes_time),
            "opens_at": job_period.iso(job_period.opens_at(job)),
            "closes_at": job_period.iso(job_period.closes_at(job)),
            "employment_type": job.employment_type,
            # Salary is only published when HR chose to show it.
            "salary_min": job.salary_min if job.salary_visible else None,
            "salary_max": job.salary_max if job.salary_visible else None,
        },
        "built_in_fields": BUILT_IN_FIELDS,
        "fields": public_fields(form.fields),
        "accepting_applications": is_accepting(form),
        "closed_reason": closed_reason(form),
        "closes_at": form.closes_at.isoformat() if form.closes_at else None,
        "max_upload_mb": current_app.config["MAX_UPLOAD_MB"],
        "privacy_notice": (
            f"{current_app.config['COMPANY_NAME']} will process the information and CV you submit to assess your "
            "application for this position. Your CV is analysed with automated tools (text extraction and skill "
            "matching) to help our recruitment team; the analysis supports, and does not replace, human decisions. "
            "Your data is used only for recruitment and kept according to our data-retention policy. You can ask us "
            "to access, correct or delete your data at any time."
        ),
    }
