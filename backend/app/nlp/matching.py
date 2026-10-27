"""Explainable job matching.

The overall score is a weighted average of component scores. Components that cannot be computed
(e.g. no dated experience) are excluded and the remaining weights are renormalised, and that exclusion
is reported. The score expresses match with the job criteria, not a probability of job success.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from . import semantic
from .entities import LEVEL_RANK, highest_education_level
from .skills import normalize_skill, related_skills

DEFAULT_WEIGHTS = {
    "required_skills": 35.0,
    "preferred_skills": 10.0,
    "experience": 20.0,
    "education": 10.0,
    "certifications": 5.0,
    "semantic": 5.0,
    "screening_questions": 15.0,
}
LEVEL_LABELS = {
    "none": "No formal requirement", "high_school": "High school", "diploma": "Diploma",
    "bachelor": "Bachelor's degree", "master": "Master's degree", "doctorate": "Doctorate",
}


# Indonesian -> English field-of-study terms so "S1 Statistika" satisfies "Statistics".
FIELD_SYNONYMS = {
    "statistika": "statistics", "statistik": "statistics", "matematika": "mathematics", "informatika": "informatics",
    "teknik informatika": "informatics computer science", "ilmu komputer": "computer science", "sistem informasi":
    "information systems", "psikologi": "psychology", "manajemen": "management", "akuntansi": "accounting",
    "ekonomi": "economics", "hukum": "law", "teknik": "engineering", "elektro": "electrical", "industri": "industrial",
    "komunikasi": "communication", "pemasaran": "marketing", "keuangan": "finance", "fisika": "physics",
    "kimia": "chemistry", "biologi": "biology", "komputer": "computer", "sains data": "data science",
}


def _translate_field(text: str) -> str:
    out = text.lower()
    for indo, eng in sorted(FIELD_SYNONYMS.items(), key=lambda kv: -len(kv[0])):
        out = re.sub(rf"\b{re.escape(indo)}\b", f"{indo} {eng}", out)
    return out


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def _flex_regex(term: str) -> re.Pattern[str]:
    parts = [re.escape(p) for p in re.split(r"[\s\-_]+", term.strip()) if p]
    return re.compile(r"(?<![A-Za-z0-9+#])" + r"[\s\-_.]*".join(parts) + r"(?![A-Za-z0-9+#])", re.IGNORECASE)


def _find_in_text(term: str, lines: list[str], sections_lookup) -> list[dict]:
    pattern = _flex_regex(term)
    out = []
    for i, line in enumerate(lines, start=1):
        if pattern.search(line):
            out.append({"text": line, "section": sections_lookup(i), "line": i})
            if len(out) >= 3:
                break
    return out


def criteria_hash(job: dict) -> str:
    keys = ["title", "description", "required_skills", "preferred_skills", "min_experience_years",
            "education_level", "education_field", "required_certifications", "weights"]
    payload = json.dumps({k: job.get(k) for k in keys}, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()


def _match_skill(req: str, category: str, skills: list[dict], lines: list[str], sec) -> dict:
    canonical = normalize_skill(req)
    target = (canonical or req).lower()
    key = f"{category}:{_slug(canonical or req)}"
    base = {"key": key, "category": category, "requirement": req, "hr_validation": None}

    for s in skills:
        if s["normalized"].lower() == target or (not canonical and s["original"].lower() == req.lower()):
            if s.get("source") == "hr":
                return {**base, "status": "matched", "matched_by": "normalized", "candidate_value": s["normalized"],
                        "explanation": "Added by HR correction.", "evidence": []}
            exact = s["original"].lower() == req.lower()
            value = s["normalized"] if exact else f"{s['original']} → {s['normalized']}"
            explanation = ("Skill found in CV." if exact else
                           f"CV mentions \"{s['original']}\", normalized to {s['normalized']}.")
            return {**base, "status": "matched", "matched_by": "exact" if exact else "normalized",
                    "candidate_value": value, "explanation": explanation, "evidence": s["evidence"][:3]}

    if not canonical:
        # Requirement outside the taxonomy: fall back to a literal (whitespace-tolerant) text search.
        found = _find_in_text(req, lines, sec)
        if found:
            return {**base, "status": "matched", "matched_by": "exact", "candidate_value": req,
                    "explanation": "Term found verbatim in CV text (not in skill taxonomy).", "evidence": found}

    related = related_skills(canonical) if canonical else set()
    related_found = [s for s in skills if s["normalized"] in related]
    if related_found:
        names = ", ".join(sorted({s["normalized"] for s in related_found}))
        return {**base, "status": "needs_review", "matched_by": "related", "candidate_value": names,
                "explanation": f"{canonical} not found directly, but the CV lists related skill(s): {names}. "
                               "HR should verify whether this satisfies the requirement.",
                "evidence": [e for s in related_found for e in s["evidence"][:1]][:3]}

    unrecognized = [s for s in skills if not s.get("in_taxonomy", True) and target in s["normalized"].lower()]
    if unrecognized:
        return {**base, "status": "needs_review", "matched_by": "related", "candidate_value": unrecognized[0]["original"],
                "explanation": "A similar but unrecognized term appears in the CV skills list; please verify.",
                "evidence": unrecognized[0]["evidence"][:2]}

    return {**base, "status": "not_found", "matched_by": None, "candidate_value": None,
            "explanation": f"No evidence of {canonical or req} found in the CV.", "evidence": []}


def _skill_component(results: list[dict], label: str) -> tuple[float | None, str]:
    if not results:
        return None, f"No {label} defined for this job."
    matched = sum(1 for r in results if r["status"] == "matched")
    review = sum(1 for r in results if r["status"] == "needs_review")
    score = (matched + 0.5 * review) / len(results) * 100
    text = f"{matched} of {len(results)} {label} matched"
    if review:
        text += f", {review} need review (counted as half)"
    return round(score, 1), text + "."


def _position_relevant(entry: dict, job_terms: set[str], req_canonicals: set[str]) -> bool:
    text = " ".join(filter(None, [entry.get("title"), entry.get("description")])).lower()
    if not text:
        return False
    title_tokens = set(re.findall(r"[a-z]{3,}", (entry.get("title") or "").lower()))
    if title_tokens & job_terms:
        return True
    return any(_flex_regex(skill).search(text) for skill in req_canonicals)


def _format_answer(value: Any) -> str:
    if value is None or value == "" or value == []:
        return "no answer"
    if value is True:
        return "checked"
    if value is False:
        return "not checked"
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return f"{value:,.0f}".replace(",", ".") if float(value).is_integer() else str(value)
    return {"yes": "Yes", "no": "No"}.get(str(value), str(value))


def _expected_text(rule: dict, ftype: str) -> str:
    if ftype == "yes_no":
        return {"yes": "Yes", "no": "No"}[rule["expected"]]
    if ftype == "select":
        return " or ".join(rule["accepted"])
    if ftype == "checkbox":
        return "checked"
    low, high = rule.get("min"), rule.get("max")
    fmt = lambda v: _format_answer(v)  # noqa: E731
    if low is not None and high is not None:
        return f"between {fmt(low)} and {fmt(high)}"
    return f"at least {fmt(low)}" if low is not None else f"at most {fmt(high)}"


def evaluate_screening_answers(answers: list[dict]) -> list[dict]:
    """Requirement results for application-form answers that carry a screening rule."""
    results = []
    for answer in answers or []:
        rule = answer.get("screening")
        if not rule or not rule.get("enabled"):
            continue
        ftype, value = answer.get("type"), answer.get("value")
        if ftype == "yes_no":
            met = value == rule.get("expected")
        elif ftype == "select":
            met = value in (rule.get("accepted") or [])
        elif ftype == "checkbox":
            met = value is True
        elif ftype == "number":
            met = isinstance(value, (int, float)) and not isinstance(value, bool) \
                and (rule.get("min") is None or value >= rule["min"]) \
                and (rule.get("max") is None or value <= rule["max"])
        else:
            continue
        expected = _expected_text(rule, ftype)
        given = _format_answer(value)
        results.append({
            "key": f"screening_question:{answer.get('field_id')}",
            "category": "screening_question",
            "requirement": answer.get("label") or "Screening question",
            "status": "matched" if met else "not_found",
            "matched_by": "computed",
            "candidate_value": given,
            "explanation": (f"Answered “{given}”; expected {expected}."
                            + (" Must-meet qualification." if rule.get("knockout") else "")),
            "evidence": [],
            "hr_validation": None,
            "knockout": bool(rule.get("knockout")),
        })
    return results


def screen(job: dict, profile: dict, clean_text: str, sections: list[dict], extra_flags: list[dict] | None = None,
           form_answers: list[dict] | None = None) -> dict[str, Any]:
    """Compare an effective candidate profile against job criteria. Pure function: no DB access."""
    lines = clean_text.split("\n") if clean_text else []

    def sec(line_no: int) -> str | None:
        for s in sections:
            if s["start_line"] <= line_no <= s["end_line"]:
                return s["name"]
        return None

    weights = {**DEFAULT_WEIGHTS, **{k: float(v) for k, v in (job.get("weights") or {}).items() if k in DEFAULT_WEIGHTS}}
    skills = profile.get("skills", [])
    requirements: list[dict] = []
    flags: list[dict] = list(extra_flags or [])
    components: dict[str, tuple[float | None, str]] = {}

    req_results = [_match_skill(s, "required_skill", skills, lines, sec) for s in job.get("required_skills", [])]
    pref_results = [_match_skill(s, "preferred_skill", skills, lines, sec) for s in job.get("preferred_skills", [])]
    requirements += req_results + pref_results
    components["required_skills"] = _skill_component(req_results, "required skills")
    components["preferred_skills"] = _skill_component(pref_results, "preferred skills")

    missing = [r["requirement"] for r in req_results if r["status"] == "not_found"]
    if missing:
        flags.append({"code": "missing_required_skills", "severity": "warning",
                      "message": f"{len(missing)} of {len(req_results)} required skills not found in CV: {', '.join(missing)}."})

    # --- experience
    total_months = profile.get("total_experience_months")
    note = profile.get("experience_calculation_note") or ""
    min_years = job.get("min_experience_years")
    experience = profile.get("experience", [])
    job_terms = set(re.findall(r"[a-z]{3,}", (job.get("title") or "").lower())) - {"senior", "junior", "staff", "lead", "head"}
    req_canonicals = {normalize_skill(s) or s for s in job.get("required_skills", [])}
    relevant = [e for e in experience if _position_relevant(e, job_terms, req_canonicals)]
    dated = [e for e in experience if e.get("duration_months")]
    relevant_months = sum(e["duration_months"] for e in relevant if e.get("duration_months"))
    dated_months = sum(e["duration_months"] for e in dated)
    relevance = (relevant_months / dated_months) if dated_months else None

    if total_months is None:
        if min_years:
            requirements.append({
                "key": "experience:min-years", "category": "experience", "requirement": f"Minimum {min_years:g} years of experience",
                "status": "needs_review", "matched_by": None, "candidate_value": None,
                "explanation": "Total experience could not be calculated from the CV dates. " + note,
                "evidence": [ev for e in experience[:3] for ev in e["evidence"][:1]], "hr_validation": None,
            })
        components["experience"] = (None, "Experience duration could not be determined from the CV; component excluded.")
        flags.append({"code": "experience_unknown", "severity": "warning",
                      "message": "Total experience could not be determined from CV dates; HR review needed."})
    else:
        years = total_months / 12
        approximate = "approximate" in note
        if min_years:
            ok = years >= min_years
            borderline = approximate and abs(years - min_years) < 1
            status = "needs_review" if borderline else ("matched" if ok else "not_found")
            requirements.append({
                "key": "experience:min-years", "category": "experience", "requirement": f"Minimum {min_years:g} years of experience",
                "status": status, "matched_by": "computed", "candidate_value": f"{years:.1f} years",
                "explanation": (f"CV shows about {years:.1f} years of dated experience. " + note +
                                ("" if ok else f" This is below the {min_years:g}-year requirement.")),
                "evidence": [ev for e in dated[:4] for ev in e["evidence"][:1]], "hr_validation": None,
            })
            years_score = min(1.0, years / min_years)
            score = years_score * 70 + (relevance if relevance is not None else years_score) * 30
            text = f"{years:.1f} of {min_years:g} required years (70%)"
        else:
            score = (relevance if relevance is not None else 0.0) * 100
            text = "No minimum years defined; score reflects relevance of positions"
        if relevance is not None:
            text += f"; {len(relevant)} of {len(dated)} dated position(s) relevant to the role (30%)" if min_years else f" ({len(relevant)} of {len(dated)} relevant)"
        components["experience"] = (round(score, 1), text + ".")
        if approximate:
            flags.append({"code": "approximate_dates", "severity": "info",
                          "message": "Some positions only have year-level dates; experience totals are approximate."})

    # Employment gaps are informational context only and do not affect the score.
    gap_entries = sorted((e for e in experience if e.get("start") and e.get("end")), key=lambda e: e["start"])
    for prev, nxt in zip(gap_entries, gap_entries[1:]):
        if prev["end"] != "present" and len(prev["end"]) == 7 and len(nxt["start"]) == 7:
            py, pm = map(int, prev["end"].split("-"))
            ny, nm = map(int, nxt["start"].split("-"))
            gap = (ny * 12 + nm) - (py * 12 + pm)
            if gap > 6:
                flags.append({"code": "employment_gap", "severity": "info",
                              "message": f"{gap}-month gap between positions ({prev['end']} → {nxt['start']}). For context only; not scored."})

    # --- education
    req_level = job.get("education_level")
    if req_level and req_level != "none":
        cand_level = highest_education_level(profile.get("education", []))
        req_field = (job.get("education_field") or "").strip()
        edu_evidence = [ev for e in profile.get("education", [])[:2] for ev in e["evidence"][:2]]
        if cand_level is None:
            status, score = "needs_review", None
            explanation = "Education level could not be identified in the CV."
        else:
            meets = LEVEL_RANK[cand_level] >= LEVEL_RANK[req_level]
            status = "matched" if meets else "not_found"
            score = 100.0 if meets else max(0.0, 100 - 35 * (LEVEL_RANK[req_level] - LEVEL_RANK[cand_level]))
            explanation = f"Highest education found: {LEVEL_LABELS[cand_level]}; required: {LEVEL_LABELS[req_level]}."
            if req_field:
                fields_text = _translate_field(" ".join(filter(None, [e.get("field") or "" for e in profile.get("education", [])] +
                                                               [e.get("degree") or "" for e in profile.get("education", [])])))
                field_tokens = [t for t in re.findall(r"[a-z]{4,}", req_field.lower())]
                if fields_text and any(t in fields_text for t in field_tokens):
                    explanation += f" Field matches \"{req_field}\"."
                else:
                    if meets:
                        status = "needs_review"
                    score = score * 0.8 if score is not None else None
                    explanation += f" Field of study does not clearly match \"{req_field}\"; please verify equivalence."
        requirements.append({
            "key": "education:level", "category": "education",
            "requirement": LEVEL_LABELS[req_level] + (f" in {req_field}" if req_field else ""),
            "status": status, "matched_by": "computed" if cand_level else None,
            "candidate_value": LEVEL_LABELS.get(cand_level) if cand_level else None,
            "explanation": explanation, "evidence": edu_evidence, "hr_validation": None,
        })
        components["education"] = (round(score, 1) if score is not None else None,
                                   explanation if score is not None else "Education level not identified; component excluded.")
    else:
        components["education"] = (None, "No education requirement defined.")

    # --- certifications
    cert_reqs = job.get("required_certifications", [])
    cert_results = []
    cert_texts = [(c["value"], c["evidence"]) for c in profile.get("certifications", []) if c.get("value")]
    for cert in cert_reqs:
        key = f"certification:{_slug(cert)}"
        base = {"key": key, "category": "certification", "requirement": cert, "hr_validation": None}
        pattern = _flex_regex(cert)
        hit = next(((v, ev) for v, ev in cert_texts if pattern.search(v)), None)
        found = _find_in_text(cert, lines, sec) if not hit else []
        if hit or found:
            cert_results.append({**base, "status": "matched", "matched_by": "exact", "candidate_value": hit[0] if hit else cert,
                                 "explanation": "Certification found in CV.", "evidence": hit[1] if hit else found})
            continue
        cert_tokens = set(re.findall(r"[a-z0-9]{3,}", cert.lower()))
        partial = None
        for v, ev in cert_texts:
            tokens = set(re.findall(r"[a-z0-9]{3,}", v.lower()))
            if cert_tokens and len(cert_tokens & tokens) / len(cert_tokens) >= 0.5:
                partial = (v, ev)
                break
        if partial:
            cert_results.append({**base, "status": "needs_review", "matched_by": "related", "candidate_value": partial[0],
                                 "explanation": f"A similar certification is listed (\"{partial[0]}\"); verify equivalence.",
                                 "evidence": partial[1]})
        else:
            cert_results.append({**base, "status": "not_found", "matched_by": None, "candidate_value": None,
                                 "explanation": f"{cert} not found in CV.", "evidence": []})
    requirements += cert_results
    components["certifications"] = _skill_component(cert_results, "required certifications")

    # --- screening questions from the application form (HR-defined expected answers)
    sq_results = evaluate_screening_answers(form_answers or [])
    requirements += sq_results
    if sq_results:
        met = sum(1 for r in sq_results if r["status"] == "matched")
        components["screening_questions"] = (round(met / len(sq_results) * 100, 1),
                                             f"{met} of {len(sq_results)} screening questions answered as expected.")
        failed_knockouts = [r["requirement"] for r in sq_results if r["knockout"] and r["status"] != "matched"]
        if failed_knockouts:
            flags.append({"code": "knockout_not_met", "severity": "warning",
                          "message": "Does not meet basic qualification(s): "
                                     + "; ".join(f"“{q.rstrip('.')}”" for q in failed_knockouts)
                                     + ". Flagged for HR review — not rejected automatically."})
    else:
        components["screening_questions"] = (None, "No scored screening questions for this application.")

    # --- semantic similarity (supporting signal)
    job_text = "\n".join(filter(None, [job.get("title"), job.get("description"),
                                       ", ".join(job.get("required_skills", []) + job.get("preferred_skills", []))]))
    if clean_text and job_text.strip():
        raw, calibrated, backend = semantic.similarity(job_text, clean_text)
        # Plain-language explanation for HR; the technical backend is kept in the result's `methods`.
        components["semantic"] = (calibrated, "How closely the wording of the CV matches the job description. "
                                              "Supporting signal only.")
    else:
        components["semantic"] = (None, "Job description or CV text is empty.")
        backend = "n/a"

    # --- overall
    active = {k: v for k, v in components.items() if v[0] is not None and weights.get(k, 0) > 0}
    total_weight = sum(weights[k] for k in active)
    overall = round(sum(components[k][0] * weights[k] for k in active) / total_weight, 1) if total_weight else None
    component_list = [{
        "component": k,
        "score": components[k][0],
        "weight": weights[k],
        "effective_weight": round(weights[k] / total_weight * 100, 1) if k in active and total_weight else 0.0,
        "explanation": components[k][1],
    } for k in DEFAULT_WEIGHTS]

    return {
        "overall_score": overall,
        "components": component_list,
        "requirements": requirements,
        "flags": flags,
        "experience_summary": _experience_summary(profile, relevant, total_months),
        "semantic_backend": backend,
    }


def _fmt_date(value: str | None) -> str:
    if not value:
        return "?"
    if value == "present":
        return "present"
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    if len(value) == 7:
        y, m = value.split("-")
        return f"{months[int(m) - 1]} {y}"
    return value


def _experience_summary(profile: dict, relevant: list[dict], total_months: int | None) -> str:
    experience = profile.get("experience", [])
    if not experience:
        return "No work experience entries could be identified in the CV."
    parts = []
    if total_months is not None:
        parts.append(f"About {total_months / 12:.1f} years of dated work experience across {len(experience)} position(s).")
    else:
        parts.append(f"{len(experience)} position(s) identified; total duration could not be calculated.")
    latest = max(experience, key=lambda e: (bool(e.get("is_current")), e.get("start") or ""))
    role = " at ".join(filter(None, [latest.get("title"), latest.get("company")])) or "Position"
    parts.append(f"Most recent: {role} ({_fmt_date(latest.get('start'))} – {_fmt_date(latest.get('end'))}).")
    if relevant:
        names = "; ".join(" at ".join(filter(None, [e.get("title"), e.get("company")])) or "Untitled position" for e in relevant[:3])
        parts.append(f"Positions relevant to this role: {names}.")
    else:
        parts.append("No positions were clearly identified as relevant to this role's title or required skills.")
    return " ".join(parts)
