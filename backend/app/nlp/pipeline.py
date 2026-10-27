"""CV processing pipeline: validate -> extract text (OCR fallback) -> preprocess -> sections ->
entities -> skills -> experience -> education -> optional LLM extraction.

Each step is timed and reported so HR and administrators can see exactly how a result was produced.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable

from ..llm.adapter import LLMAdapter, LLMError
from . import entities, semantic
from .llm_extraction import merge_llm_extraction, run_llm_extraction
from .preprocessing import clean_text, detect_sections
from .skills import extract_skills, load_taxonomy
from .text_extraction import DocumentError, extract_text, validate_upload

PIPELINE_VERSION = "ti-nlp-1.0.0"


@dataclass
class PipelineResult:
    status: str  # completed | failed
    steps: list[dict[str, Any]] = field(default_factory=list)
    clean_text: str | None = None
    sections: list[dict[str, Any]] = field(default_factory=list)
    extraction: dict[str, Any] | None = None
    page_count: int | None = None
    ocr_used: bool = False
    methods: dict[str, str] = field(default_factory=dict)
    error_code: str | None = None
    error_message: str | None = None
    processing_ms: int = 0


class _Steps:
    def __init__(self):
        self.items: list[dict[str, Any]] = []

    def run(self, name: str, fn: Callable[[], Any], detail: Callable[[Any], str | None] | None = None):
        started = time.perf_counter()
        try:
            value = fn()
        except Exception as exc:
            self.items.append({"name": name, "status": "failed", "duration_ms": _ms(started),
                               "detail": getattr(exc, "message", None) or type(exc).__name__})
            raise
        self.items.append({"name": name, "status": "ok", "duration_ms": _ms(started),
                           "detail": detail(value) if detail else None})
        return value

    def add(self, name: str, status: str, detail: str | None, started: float | None = None):
        self.items.append({"name": name, "status": status, "duration_ms": _ms(started) if started else 0, "detail": detail})


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


def methods_info(llm: LLMAdapter, use_llm: bool) -> dict[str, str]:
    tax = load_taxonomy()
    embed_backend, _ = semantic.backend_info()
    return {
        "ner": "rule-based (regex, gazetteer, section context)",
        "skills": f"{tax.version} ({len(tax.skills)} skills, {tax.alias_count} aliases)",
        "embeddings": embed_backend,
        "llm": llm.describe() if (llm.enabled and use_llm) else "disabled",
    }


def process_document(filename: str, data: bytes, *, max_bytes: int, max_pages: int,
                     llm: LLMAdapter, use_llm: bool = True) -> PipelineResult:
    overall = time.perf_counter()
    steps = _Steps()
    result = PipelineResult(status="failed", methods=methods_info(llm, use_llm))
    try:
        mime = steps.run("validate", lambda: validate_upload(filename, data, max_bytes), lambda m: m.split("/")[-1])
        extracted = steps.run(
            "extract_text", lambda: extract_text(data, mime, max_pages),
            lambda e: f"{len(e.text)} characters" + (f", {e.page_count} page(s)" if e.page_count else ""),
        )
        result.page_count = extracted.page_count
        result.ocr_used = extracted.ocr_used
        steps.add("ocr", "warning" if extracted.ocr_used else "skipped",
                  "Scanned PDF processed with OCR." if extracted.ocr_used else "Not needed: document has a text layer.")

        text = steps.run("preprocess", lambda: clean_text(extracted.text), lambda t: f"{len(t.splitlines())} lines")
        lines = text.split("\n")
        sections = steps.run(
            "sections", lambda: detect_sections(lines),
            lambda s: ", ".join(dict.fromkeys(x.name for x in s if x.name != "header")) or "No section headings found",
        )

        def run_entities():
            return {
                "name": entities.extract_name(lines, sections),
                "email": entities.extract_email(lines, sections),
                "phone": entities.extract_phone(lines, sections),
                "location": entities.extract_location(lines, sections),
                "summary": entities.extract_summary(lines, sections),
                "certifications": entities.extract_certifications(lines, sections),
                "languages": entities.extract_languages(lines, sections),
            }

        ents = steps.run("entities", run_entities,
                         lambda e: f"found: {', '.join(k for k in ('name', 'email', 'phone', 'location') if e[k]['value']) or 'none'}")
        skills = steps.run("skills", lambda: extract_skills(lines, sections),
                           lambda s: f"{sum(1 for x in s if x['in_taxonomy'])} normalized, {sum(1 for x in s if not x['in_taxonomy'])} unrecognized")
        experience, total_months, note = steps.run(
            "experience", lambda: entities.extract_experience(lines, sections),
            lambda r: f"{len(r[0])} position(s)" + (f", {r[1]} months total" if r[1] is not None else ", total not computable"),
        )
        education = steps.run("education", lambda: entities.extract_education(lines, sections),
                              lambda e: f"{len(e)} entr{'y' if len(e) == 1 else 'ies'}")

        extraction: dict[str, Any] = {
            **ents,
            "skills": skills,
            "experience": experience,
            "education": education,
            "total_experience_months": total_months,
            "experience_calculation_note": note,
            "sections_detected": [s.name for s in sections if s.name != "header"],
        }

        if llm.enabled and use_llm:
            started = time.perf_counter()
            try:
                llm_out = run_llm_extraction(llm, lines, sections)
                stats = merge_llm_extraction(extraction, llm_out, lines, sections)
                steps.add("llm_extraction", "ok",
                          f"{stats['accepted']} value(s) accepted, {stats['rejected']} rejected (not found verbatim in CV)", started)
            except LLMError as exc:
                # The rule-based result is complete on its own; record the provider failure.
                steps.add("llm_extraction", "warning", f"LLM unavailable ({exc.code}): {exc.message} Rule-based results used.", started)
                result.methods["llm"] = f"failed: {exc.code}"
        else:
            steps.add("llm_extraction", "skipped", "LLM not configured; rule-based extraction only.")

        result.status = "completed"
        result.clean_text = text
        result.sections = [{"name": s.name, "start_line": s.start_line, "end_line": s.end_line} for s in sections]
        result.extraction = extraction
    except DocumentError as exc:
        result.error_code = exc.code
        result.error_message = exc.message
    except Exception as exc:  # unexpected bug: report generically, never leak CV content
        result.error_code = "processing_error"
        result.error_message = f"Unexpected processing error ({type(exc).__name__})."
    result.steps = steps.items
    result.processing_ms = _ms(overall)
    return result
