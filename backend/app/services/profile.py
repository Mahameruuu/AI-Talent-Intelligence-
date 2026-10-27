"""Effective candidate profile = latest AI extraction with HR corrections applied on top.

The AI extraction (``Document.extraction``) and HR corrections (``Candidate.corrections``) are stored
separately; this module only combines them for display and screening.
"""

from __future__ import annotations

import copy
from typing import Any

from ..models import Candidate, Document
from ..nlp.skills import load_taxonomy, normalize_skill


def latest_completed_document(candidate: Candidate, application_id: int | None = None) -> Document | None:
    docs = [d for d in candidate.documents if d.status == "completed" and d.extraction]
    if application_id is not None:
        scoped = [d for d in docs if d.application_id == application_id]
        docs = scoped or docs
    return max(docs, key=lambda d: d.processed_at or d.created_at) if docs else None


def effective_profile(candidate: Candidate, document: Document | None) -> dict[str, Any]:
    corrections = candidate.corrections or {}
    extraction = copy.deepcopy(document.extraction) if document and document.extraction else None
    removed = {s.lower() for s in corrections.get("skills_remove", [])}

    skills: list[dict] = []
    if extraction:
        for s in extraction.get("skills", []):
            if s["normalized"].lower() in removed or s["original"].lower() in removed:
                continue
            skills.append({**s, "source": "ai"})
    existing = {s["normalized"].lower() for s in skills}
    tax = load_taxonomy()
    for name in corrections.get("skills_add", []):
        canonical = normalize_skill(name) or name.strip()
        if canonical.lower() in existing:
            continue
        existing.add(canonical.lower())
        entry = tax.skills.get(canonical)
        skills.append({"original": name, "normalized": canonical, "category": entry.category if entry else None,
                       "in_taxonomy": entry is not None, "method": "hr-correction", "evidence": [], "source": "hr"})

    total = extraction.get("total_experience_months") if extraction else None
    note = extraction.get("experience_calculation_note", "") if extraction else ""
    if "total_experience_months" in corrections:
        total = corrections["total_experience_months"]
        note = "Total experience set by HR correction."

    def pick(key: str, column_value):
        if key in corrections and corrections[key] not in (None, ""):
            return corrections[key]
        return column_value

    return {
        "full_name": pick("full_name", candidate.full_name),
        "email": pick("email", candidate.email),
        "phone": pick("phone", candidate.phone),
        "location": pick("location", (extraction or {}).get("location", {}).get("value")),
        "skills": skills,
        "experience": extraction.get("experience", []) if extraction else [],
        "education": extraction.get("education", []) if extraction else [],
        "certifications": extraction.get("certifications", []) if extraction else [],
        "languages": extraction.get("languages", []) if extraction else [],
        "total_experience_months": total,
        "experience_calculation_note": note,
        "extraction": extraction,
    }
