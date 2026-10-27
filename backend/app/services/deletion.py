"""Permanent deletion of applications and candidates (right to erasure).

Deleting an application cascades in the database to its documents, screening results, HR reviews, stage
history and interview sessions (with their messages and evaluations). Email logs only reference sessions
with ``ON DELETE SET NULL`` and hold the candidate's address, so they are deleted explicitly here.

Stored CV files must be removed only after the transaction commits: call :func:`remove_files` with
``Purge.storage_keys`` after ``db.session.commit()``.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field

from sqlalchemy import delete, func, select

from ..extensions import db
from ..models import Application, Candidate, Document, EmailLog, InterviewSession
from . import storage


@dataclass
class Purge:
    applications: int = 0
    documents: int = 0
    interview_sessions: int = 0
    storage_keys: list[str] = field(default_factory=list)

    def counts(self) -> dict[str, int]:
        return {"applications": self.applications, "documents": self.documents,
                "interview_sessions": self.interview_sessions}


def purge_applications(application_ids: Iterable[int]) -> Purge:
    """Delete applications and everything attached to them (not committed)."""
    ids = list(application_ids)
    if not ids:
        return Purge()
    keys = list(db.session.scalars(select(Document.storage_key).where(Document.application_id.in_(ids))))
    session_ids = list(db.session.scalars(select(InterviewSession.id).where(InterviewSession.application_id.in_(ids))))
    if session_ids:
        db.session.execute(delete(EmailLog).where(EmailLog.session_id.in_(session_ids)))
    # Everything else cascades in the database (ON DELETE CASCADE).
    db.session.execute(delete(Application).where(Application.id.in_(ids)))
    db.session.expire_all()  # drop stale ORM objects removed by the bulk delete
    return Purge(applications=len(ids), documents=len(keys), interview_sessions=len(session_ids), storage_keys=keys)


def purge_candidate(candidate: Candidate) -> Purge:
    """Delete a candidate with all applications and data (not committed)."""
    candidate_id = candidate.id
    emails = {e.strip().lower() for e in (candidate.email, (candidate.corrections or {}).get("email")) if e}
    app_ids = list(db.session.scalars(select(Application.id).where(Application.candidate_id == candidate_id)))
    # Documents always belong to an application, but collect any stray ones by candidate too.
    all_keys = list(db.session.scalars(select(Document.storage_key).where(Document.candidate_id == candidate_id)))
    result = purge_applications(app_ids)
    stray_keys = [k for k in all_keys if k not in set(result.storage_keys)]
    result.documents += len(stray_keys)
    result.storage_keys += stray_keys
    if emails:
        # Emails whose session link was already cleared (e.g. by an earlier job deletion).
        db.session.execute(delete(EmailLog).where(EmailLog.session_id.is_(None),
                                                  func.lower(EmailLog.to_email).in_(emails)))
    db.session.execute(delete(Candidate).where(Candidate.id == candidate_id))
    db.session.expire_all()
    return result


def remove_files(keys: Iterable[str]) -> None:
    for key in keys:
        storage.remove(key)

