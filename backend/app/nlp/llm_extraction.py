"""LLM-assisted structured extraction, verified against the CV text.

The LLM only *proposes* values. A value is accepted only if its text can be found in the CV line it
cites (or anywhere in the CV as a fallback); otherwise it is discarded. Rule-based results stay primary:
LLM values fill gaps, they never overwrite.
"""

from __future__ import annotations

import re

from pydantic import BaseModel, Field

from ..llm.adapter import LLMAdapter, LLMError
from . import entities
from .preprocessing import Section
from .skills import load_taxonomy, normalize_skill


class LLMValue(BaseModel):
    value: str | None = Field(description="Exact text copied from the CV, or null if not present")
    line: int | None = Field(description="Line number where the value appears, or null")


class LLMSkill(BaseModel):
    original: str = Field(description="Skill exactly as written in the CV")
    line: int


class LLMExperience(BaseModel):
    title: str | None
    company: str | None
    start: str | None = Field(description="Start date exactly as written, e.g. 'Jan 2020'")
    end: str | None = Field(description="End date exactly as written, or 'Present'")
    lines: list[int]


class LLMEducation(BaseModel):
    degree: str | None
    field: str | None
    institution: str | None
    end_year: str | None
    lines: list[int]


class LLMCVExtraction(BaseModel):
    name: LLMValue
    email: LLMValue
    phone: LLMValue
    location: LLMValue
    skills: list[LLMSkill]
    experience: list[LLMExperience]
    education: list[LLMEducation]
    certifications: list[LLMValue]


SYSTEM = (
    "You extract structured data from a CV for a recruiting tool. Copy values verbatim from the CV text. "
    "Never infer, translate, or invent information: if something is not explicitly written, return null or "
    "an empty list. Every value must cite the line number where it appears. The CV may be in English or Indonesian."
)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip().lower()


def _verify(value: str | None, line: int | None, lines: list[str]) -> int | None:
    """Return the line number supporting ``value`` or None if it can't be found verbatim."""
    if not value or not value.strip():
        return None
    needle = _norm(value)
    if line and 1 <= line <= len(lines) and needle in _norm(lines[line - 1]):
        return line
    for i, text in enumerate(lines, start=1):
        if needle in _norm(text):
            return i
    return None


def run_llm_extraction(llm: LLMAdapter, lines: list[str], sections: list[Section]) -> LLMCVExtraction:
    numbered = "\n".join(f"{i}: {t}" for i, t in enumerate(lines, start=1))
    prompt = (
        "Extract the candidate information from this CV. Lines are prefixed with their line number.\n\n"
        f"<cv>\n{numbered}\n</cv>"
    )
    return llm.generate_json(system=SYSTEM, prompt=prompt, schema=LLMCVExtraction, max_tokens=12000, effort="low")


def merge_llm_extraction(result: dict, llm_out: LLMCVExtraction, lines: list[str], sections: list[Section]) -> dict:
    """Fill gaps in the rule-based ``result`` with verified LLM values. Returns merge statistics."""
    stats = {"accepted": 0, "rejected": 0}

    def ev(line_no: int) -> dict:
        return entities.evidence(lines, sections, line_no)

    for key in ("name", "email", "phone", "location"):
        proposal: LLMValue = getattr(llm_out, key)
        if result[key]["value"] is not None or not proposal.value:
            continue
        line = _verify(proposal.value, proposal.line, lines)
        if line is None:
            stats["rejected"] += 1
            continue
        result[key] = entities.field(proposal.value.strip(), [ev(line)], "llm-verified", "medium")
        stats["accepted"] += 1

    known = {s["normalized"].lower() for s in result["skills"]} | {s["original"].lower() for s in result["skills"]}
    for skill in llm_out.skills:
        line = _verify(skill.original, skill.line, lines)
        if line is None:
            stats["rejected"] += 1
            continue
        canonical = normalize_skill(skill.original)
        name = canonical or skill.original.strip()
        if name.lower() in known or len(name) > 60:
            continue
        known.add(name.lower())
        entry = load_taxonomy().skills.get(canonical) if canonical else None
        result["skills"].append({
            "original": skill.original.strip(),
            "normalized": name,
            "category": entry.category if entry else None,
            "in_taxonomy": entry is not None,
            "method": "llm-verified",
            "evidence": [ev(line)],
        })
        stats["accepted"] += 1

    if not result["experience"]:
        for item in llm_out.experience:
            support = [n for n in item.lines if 1 <= n <= len(lines)]
            title_line = _verify(item.title, support[0] if support else None, lines) if item.title else None
            company_line = _verify(item.company, support[0] if support else None, lines) if item.company else None
            if title_line is None and company_line is None:
                stats["rejected"] += 1
                continue
            start = entities.parse_date(item.start) if item.start and _verify(item.start, None, lines) else None
            is_current = bool(item.end and re.fullmatch(entities._PRESENT, item.end.strip(), re.IGNORECASE))
            end = None if is_current else (entities.parse_date(item.end) if item.end and _verify(item.end, None, lines) else None)
            evidence_lines = sorted({n for n in (title_line, company_line) if n})
            result["experience"].append({
                "title": item.title if title_line else None,
                "company": item.company if company_line else None,
                "start": start.iso() if start else None,
                "end": "present" if is_current else (end.iso() if end else None),
                "is_current": is_current,
                "duration_months": None,
                "description": None,
                "evidence": [ev(n) for n in evidence_lines],
                "_interval": (start, end, is_current),
            })
            stats["accepted"] += 1
        if result["experience"]:
            total, note = entities._total_experience(result["experience"])
            for e in result["experience"]:
                e.pop("_interval", None)
            result["total_experience_months"] = total
            result["experience_calculation_note"] = note + " Positions were identified with LLM assistance and verified against the CV text."

    if not result["education"]:
        for item in llm_out.education:
            inst_line = _verify(item.institution, item.lines[0] if item.lines else None, lines) if item.institution else None
            degree_line = _verify(item.degree, item.lines[0] if item.lines else None, lines) if item.degree else None
            if inst_line is None and degree_line is None:
                stats["rejected"] += 1
                continue
            level, _ = entities._degree_level(item.degree or "")
            year = int(item.end_year) if item.end_year and item.end_year.isdigit() and _verify(item.end_year, None, lines) else None
            result["education"].append({
                "level": level,
                "degree": item.degree if degree_line else None,
                "field": item.field if item.field and _verify(item.field, None, lines) else None,
                "institution": item.institution if inst_line else None,
                "start_year": None,
                "end_year": year,
                "gpa": None,
                "evidence": [ev(n) for n in sorted({n for n in (inst_line, degree_line) if n})],
            })
            stats["accepted"] += 1

    if not result["certifications"]:
        for cert in llm_out.certifications:
            line = _verify(cert.value, cert.line, lines)
            if line is None:
                stats["rejected"] += 1
                continue
            result["certifications"].append(entities.field(cert.value.strip(), [ev(line)], "llm-verified", "medium"))
            stats["accepted"] += 1
    return stats


__all__ = ["run_llm_extraction", "merge_llm_extraction", "LLMError"]
