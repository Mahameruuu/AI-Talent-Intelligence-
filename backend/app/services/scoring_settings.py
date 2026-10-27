"""Organisation-wide scoring weights, set by HR in Settings and applied to every job.

When the weights change, applications of open jobs are re-screened in the background so every candidate in
a job is ranked with the same rules. Older screening results stay in history (screenings are append-only).
"""

from __future__ import annotations

import logging

from ..errors import bad_request
from ..extensions import db
from ..models import AppSetting, Application, Document, Job, Actor
from ..nlp.matching import DEFAULT_WEIGHTS
from ..worker import worker
from . import audit

log = logging.getLogger(__name__)

SETTING_KEY = "scoring_weights"

# Fixed descriptions shown to HR (only the numbers are editable), in display order.
WEIGHT_ROWS = [
    ("required_skills", "Skill wajib", "Skill wajib lowongan yang ditemukan di CV"),
    ("preferred_skills", "Skill tambahan", "Skill tambahan (nice-to-have) yang ditemukan di CV"),
    ("experience", "Pengalaman kerja", "Lama pengalaman dibanding syarat minimal, dan relevansi posisi"),
    ("education", "Pendidikan", "Jenjang pendidikan dan kesesuaian jurusan"),
    ("certifications", "Sertifikasi", "Sertifikasi yang disyaratkan lowongan"),
    ("semantic", "Kemiripan teks CV dengan deskripsi lowongan", "Kemiripan kata antara CV dan deskripsi lowongan"),
    ("screening_questions", "Screening questions",
     "Jawaban pelamar pada pertanyaan kualifikasi di formulir lamaran sesuai dengan yang diharapkan"),
]


def get_weights() -> dict[str, float]:
    row = db.session.get(AppSetting, SETTING_KEY)
    if row is None:
        return dict(DEFAULT_WEIGHTS)
    # Components added after the weights were saved count as 0 so the saved total stays 100%.
    return {key: float(row.value.get(key, 0)) for key in DEFAULT_WEIGHTS}


def _open_job_applications():
    return (Application.query.join(Job)
            .filter(Job.status != "closed", Application.documents.any(Document.status == "completed")))


def describe() -> dict:
    row = db.session.get(AppSetting, SETTING_KEY)
    weights = get_weights()
    return {
        "items": [{"no": i, "key": key, "label": label, "description": desc, "weight": weights[key]}
                  for i, (key, label, desc) in enumerate(WEIGHT_ROWS, start=1)],
        "total": round(sum(weights.values()), 2),
        "is_default": row is None,
        "updated_at": row.updated_at.isoformat() if row else None,
        "updated_by": row.updated_by.full_name if row and row.updated_by else None,
        "affected_applications": _open_job_applications().count(),
    }


def validate(raw: object) -> dict[str, float]:
    if not isinstance(raw, dict):
        raise bad_request("'weights' must be an object of {component: percentage}.")
    unknown = sorted(set(raw) - set(DEFAULT_WEIGHTS))
    if unknown:
        raise bad_request("Unknown weight components.", {"unknown": unknown})
    errors: dict[str, str] = {}
    weights: dict[str, float] = {}
    for key, _label, _desc in WEIGHT_ROWS:
        value = raw.get(key, 0)
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            errors[key] = "Must be a number."
            continue
        if not 0 <= value <= 100:
            errors[key] = "Must be between 0 and 100."
            continue
        weights[key] = round(float(value), 2)
    if errors:
        raise bad_request("Invalid weights.", {"fields": errors})
    total = round(sum(weights.values()), 2)
    if total != 100:
        raise bad_request(f"Weights must add up to 100% (currently {total:g}%).", {"total": total},
                          code="weights_total_not_100")
    return weights


def save(raw: object, actor: Actor) -> dict:
    weights = validate(raw)
    before = get_weights()
    row = db.session.get(AppSetting, SETTING_KEY)
    if row is None:
        row = AppSetting(key=SETTING_KEY, value=weights, updated_by_id=actor.id)
        db.session.add(row)
    else:
        row.value = weights
        row.updated_by_id = actor.id
    changed = weights != before
    audit.record("settings.scoring_weights_updated", "setting", None, {"before": before, "after": weights})
    db.session.commit()
    queued = 0
    if changed:
        queued = _open_job_applications().count()
        worker.submit("rescreen:weights", rescreen_open_jobs)
    return {**describe(), "rescreen_queued": queued}


def rescreen_open_jobs() -> None:
    """Re-run screening for applications of open jobs with the current weights (no CV re-processing)."""
    from .screening import run_screening

    ids = [a.id for a in _open_job_applications().with_entities(Application.id).all()]
    done = 0
    for app_id in ids:
        application = db.session.get(Application, app_id)
        try:
            run_screening(application, actor_label="scoring-weights-update")
            done += 1
        except Exception:  # one bad application must not stop the rest
            db.session.rollback()
            log.exception("Re-screening application %s failed", app_id)
    log.info("Re-screened %s of %s applications after a scoring-weights change.", done, len(ids))
