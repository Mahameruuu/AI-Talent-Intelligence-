"""Skill extraction and normalization against a curated taxonomy.

Every extracted skill keeps the original surface form and the line it came from, so HR can
check that a normalization (e.g. "sklearn" -> "scikit-learn") is correct.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from .preprocessing import Section, inline_labelled_lines, section_lines, section_of_line

TAXONOMY_PATH = Path(__file__).parent / "data" / "skills_taxonomy.json"

_LEFT = r"(?<![A-Za-z0-9+#])"
_RIGHT = r"(?![A-Za-z0-9+#]|\.[A-Za-z0-9])"
_LIST_SPLIT_RE = re.compile(r"\s*(?:,|;|\||•| - |\t)\s*")
_ORG_PREFIX_RE = re.compile(r"\b(PT|CV|Tbk|Inc|Ltd|LLC|Corp)\b\.?")
_LEVEL_SUFFIX_RE = re.compile(
    r"\s*[\(\[]?\b(basic|intermediate|advanced|expert|beginner|proficient|fluent|native|dasar|menengah|mahir|"
    r"aktif|pasif|\d+\+?\s*(years?|yrs?|tahun))\b[\)\]]?\s*$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class SkillEntry:
    name: str
    category: str
    aliases: tuple[str, ...]


@dataclass
class Taxonomy:
    version: str
    skills: dict[str, SkillEntry]
    patterns: list[tuple[re.Pattern[str], str, str, bool]]  # (regex, canonical, surface alias, ambiguous)
    related: dict[str, set[str]]
    lookup: dict[str, str]  # normalized key -> canonical
    alias_count: int = 0
    ambiguous: set[str] = field(default_factory=set)


def _norm_key(text: str) -> str:
    return re.sub(r"[\s\-_.]+", "", text.lower())


def _alias_pattern(alias: str) -> str:
    parts = [re.escape(p) for p in re.split(r"[\s\-_]+", alias.strip()) if p]
    body = r"[\s\-_.]*".join(parts)
    return _LEFT + body + _RIGHT


@lru_cache(maxsize=1)
def load_taxonomy() -> Taxonomy:
    raw = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))
    ambiguous = {a.lower() for a in raw.get("ambiguous_aliases", [])}
    skills: dict[str, SkillEntry] = {}
    lookup: dict[str, str] = {}
    surface: list[tuple[str, str]] = []
    alias_count = 0
    for item in raw["skills"]:
        entry = SkillEntry(item["name"], item["category"], tuple(item.get("aliases", [])))
        skills[entry.name] = entry
        for form in (entry.name, *entry.aliases):
            lookup.setdefault(_norm_key(form), entry.name)
            surface.append((form, entry.name))
        alias_count += len(entry.aliases)
    # Longest forms first so "React Native" wins over "React", "PyTorch framework" over "PyTorch".
    surface.sort(key=lambda item: len(item[0]), reverse=True)
    patterns = []
    for form, canonical in surface:
        is_ambiguous = form.lower() in ambiguous or len(form) <= 2
        patterns.append((re.compile(_alias_pattern(form), re.IGNORECASE), canonical, form, is_ambiguous))
    related: dict[str, set[str]] = {}
    for group in raw.get("related", []):
        for name in group:
            related.setdefault(name, set()).update(n for n in group if n != name)
    return Taxonomy(raw["version"], skills, patterns, related, lookup, alias_count, ambiguous)


def normalize_skill(text: str) -> str | None:
    """Map a free-text skill (e.g. a job requirement) to its canonical taxonomy name."""
    tax = load_taxonomy()
    key = _norm_key(text)
    if key in tax.lookup:
        return tax.lookup[key]
    stripped = _LEVEL_SUFFIX_RE.sub("", text).strip()
    return tax.lookup.get(_norm_key(stripped))


def related_skills(canonical: str) -> set[str]:
    return load_taxonomy().related.get(canonical, set())


def _ambiguous_ok_in_prose(line: str, match: re.Match[str]) -> bool:
    """Short or common words ("Go", "R", "excel in", "sales") only count inside a skills list, except
    capitalised mid-sentence mentions of longer names such as "using Spark and Kafka"."""
    text = match.group(0)
    if len(text) <= 2 or not text[0].isupper():
        return False
    before = line[: match.start()].strip(" -")
    if _ORG_PREFIX_RE.search(before):  # part of a company name, e.g. "PT Sinar Logistik"
        return False
    return bool(before) and not before.endswith((".", ":", "|"))


def _evidence(lines: list[str], sections: list[Section], line_no: int) -> dict:
    return {"text": lines[line_no - 1], "section": section_of_line(sections, line_no), "line": line_no}


def extract_skills(lines: list[str], sections: list[Section]) -> list[dict]:
    """Find taxonomy skills anywhere in the CV, plus unrecognized items listed in the skills section."""
    tax = load_taxonomy()
    skills_section_lines = {n for n, _ in section_lines(lines, sections, "skills")}
    labelled = inline_labelled_lines(lines, "skills")
    skills_section_lines.update(n for n, _ in labelled)

    found: dict[str, dict] = {}
    for line_no, line in enumerate(lines, start=1):
        if not line:
            continue
        in_skills = line_no in skills_section_lines
        consumed = [False] * len(line)
        for pattern, canonical, form, ambiguous in tax.patterns:
            for match in pattern.finditer(line):
                start, end = match.span()
                if any(consumed[start:end]):
                    continue
                if ambiguous and not in_skills and not _ambiguous_ok_in_prose(line, match):
                    continue
                for i in range(start, end):
                    consumed[i] = True
                original = match.group(0)
                method = "dictionary" if _norm_key(original) == _norm_key(canonical) else "alias"
                item = found.get(canonical)
                if item is None:
                    entry = tax.skills[canonical]
                    item = found[canonical] = {
                        "original": original,
                        "normalized": canonical,
                        "category": entry.category,
                        "in_taxonomy": True,
                        "method": method,
                        "evidence": [],
                    }
                if len(item["evidence"]) < 3 and all(e["line"] != line_no for e in item["evidence"]):
                    item["evidence"].append(_evidence(lines, sections, line_no))

    # Unrecognized items explicitly listed in the skills section are kept but flagged for review.
    candidate_lines = section_lines(lines, sections, "skills") + labelled
    for line_no, text in candidate_lines:
        content = text.split(":", 1)[1] if ":" in text and len(text.split(":", 1)[0]) < 30 else text
        content = content.lstrip("- ").strip()
        if not content:
            continue
        for token in _LIST_SPLIT_RE.split(content):
            token = _LEVEL_SUFFIX_RE.sub("", token.strip(" .()[]")).strip()
            if not (2 <= len(token) <= 40) or len(token.split()) > 4:
                continue
            if not re.search(r"[A-Za-z]", token):
                continue
            if normalize_skill(token):
                continue
            key = token.lower()
            if any(item["original"].lower() == key for item in found.values()):
                continue
            # Avoid sentences: require list-like tokens (not starting with a lowercase verb-like word).
            if len(token.split()) > 1 and token[0].islower():
                continue
            found[f"__unrecognized__{key}"] = {
                "original": token,
                "normalized": token,
                "category": None,
                "in_taxonomy": False,
                "method": "section-list",
                "evidence": [_evidence(lines, sections, line_no)],
            }
    return sorted(found.values(), key=lambda s: (not s["in_taxonomy"], s["normalized"].lower()))
