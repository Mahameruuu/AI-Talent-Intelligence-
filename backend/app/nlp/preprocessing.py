"""Text cleaning and section detection (English and Indonesian CVs)."""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

BULLETS = "•●▪■◦‣∙·○◆◇►▶➢➤✓✔-*–—"
_BULLET_RE = re.compile(r"^\s*[•●▪■◦‣∙·○◆◇►▶➢➤✓✔*]+\s*")
_DASH_BULLET_RE = re.compile(r"^\s*[-–—]\s+")
_SPACES_RE = re.compile(r"[ \t  -​]+")
_HYPHEN_BREAK_RE = re.compile(r"(\w)-\n(\w)")

SECTION_HEADINGS: dict[str, list[str]] = {
    "summary": [
        "summary", "professional summary", "profile", "professional profile", "about me", "about",
        "objective", "career objective", "personal statement", "ringkasan", "profil", "tentang saya",
        "ringkasan profesional", "profil singkat", "tujuan karir",
    ],
    "experience": [
        "experience", "work experience", "professional experience", "employment history", "employment",
        "work history", "career history", "relevant experience", "pengalaman kerja", "pengalaman",
        "riwayat pekerjaan", "pengalaman profesional", "riwayat kerja", "pengalaman bekerja",
    ],
    "education": [
        "education", "academic background", "educational background", "academic history", "pendidikan",
        "riwayat pendidikan", "latar belakang pendidikan", "pendidikan formal",
    ],
    "skills": [
        "skills", "technical skills", "core competencies", "competencies", "key skills", "expertise",
        "areas of expertise", "tools", "tools & technologies", "technologies", "tech stack", "hard skills",
        "soft skills", "skills & tools", "skills and tools", "keahlian", "keterampilan", "kemampuan", "skill",
        "kompetensi", "keahlian teknis", "skills & expertise",
    ],
    "certifications": [
        "certifications", "certification", "certificates", "licenses", "licenses & certifications",
        "licenses and certifications", "training", "trainings", "courses", "training & certifications",
        "sertifikasi", "sertifikat", "pelatihan", "pelatihan & sertifikasi", "pelatihan dan sertifikasi", "kursus",
    ],
    "projects": ["projects", "personal projects", "portfolio", "key projects", "proyek", "projek", "portofolio"],
    "languages": ["languages", "language", "language skills", "bahasa", "kemampuan bahasa"],
    "organizations": [
        "organizations", "organisations", "organizational experience", "volunteer", "volunteering",
        "volunteer experience", "pengalaman organisasi", "organisasi", "kegiatan organisasi",
    ],
    "awards": ["awards", "achievements", "honors", "honours", "penghargaan", "prestasi"],
    "other": ["references", "referensi", "interests", "hobbies", "hobi", "minat", "publications", "publikasi",
              "personal information", "personal details", "data pribadi", "informasi pribadi", "contact", "kontak"],
}

_HEADING_LOOKUP: dict[str, str] = {
    heading: section for section, headings in SECTION_HEADINGS.items() for heading in headings
}
_INLINE_HEADING_RE = re.compile(
    r"^(?P<head>" + "|".join(sorted((re.escape(h) for h in _HEADING_LOOKUP), key=len, reverse=True)) + r")\s*[:：]\s*(?P<rest>.+)$",
    re.IGNORECASE,
)


@dataclass
class Section:
    name: str
    start_line: int  # 1-based, inclusive (the heading line)
    end_line: int  # 1-based, inclusive
    heading: str | None


def clean_text(raw: str) -> str:
    text = unicodedata.normalize("NFKC", raw)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\f", "\n")
    text = _HYPHEN_BREAK_RE.sub(r"\1\2", text)
    lines: list[str] = []
    for line in text.split("\n"):
        line = _BULLET_RE.sub("- ", line)
        line = _DASH_BULLET_RE.sub("- ", line)
        line = _SPACES_RE.sub(" ", line).strip()
        lines.append(line)
    # Collapse runs of blank lines to a single blank line.
    out: list[str] = []
    for line in lines:
        if not line and out and not out[-1]:
            continue
        out.append(line)
    while out and not out[0]:
        out.pop(0)
    while out and not out[-1]:
        out.pop()
    return "\n".join(out)


def match_heading(line: str) -> tuple[str, str | None] | None:
    """Return (section, inline_content) if the line is a section heading."""
    stripped = line.strip().strip("-:：|#*=_ ").strip()
    if not stripped or len(stripped) > 60:
        return None
    key = re.sub(r"\s+", " ", stripped.lower())
    key = key.replace(" and ", " & ") if key not in _HEADING_LOOKUP else key
    if key in _HEADING_LOOKUP:
        return _HEADING_LOOKUP[key], None
    inline = _INLINE_HEADING_RE.match(line.strip())
    if inline:
        return _HEADING_LOOKUP[inline.group("head").lower()], inline.group("rest").strip()
    return None


def detect_sections(lines: list[str]) -> list[Section]:
    sections: list[Section] = []
    current = Section(name="header", start_line=1, end_line=len(lines), heading=None)
    for idx, line in enumerate(lines, start=1):
        found = match_heading(line)
        if not found:
            continue
        section_name, inline = found
        if inline is not None:
            # "Tools: Jira, Git" inside an experience entry is a labelled list, not a new section.
            continue
        current.end_line = idx - 1
        if current.end_line >= current.start_line:
            sections.append(current)
        current = Section(name=section_name, start_line=idx, end_line=len(lines), heading=line.strip())
    current.end_line = len(lines)
    sections.append(current)
    return sections


def section_of_line(sections: list[Section], line_no: int) -> str | None:
    for section in sections:
        if section.start_line <= line_no <= section.end_line:
            return section.name
    return None


def section_lines(lines: list[str], sections: list[Section], name: str) -> list[tuple[int, str]]:
    """All (line_no, text) pairs belonging to sections with the given name, excluding heading lines."""
    out: list[tuple[int, str]] = []
    for section in sections:
        if section.name != name:
            continue
        start = section.start_line + (1 if section.heading is not None else 0)
        for line_no in range(start, section.end_line + 1):
            out.append((line_no, lines[line_no - 1]))
    return out


def inline_labelled_lines(lines: list[str], name: str) -> list[tuple[int, str]]:
    """Lines anywhere in the CV such as 'Skills: Python, SQL' whose label maps to ``name``."""
    out: list[tuple[int, str]] = []
    for line_no, text in enumerate(lines, start=1):
        found = match_heading(text)
        if found and found[0] == name and found[1]:
            out.append((line_no, found[1]))
    return out
