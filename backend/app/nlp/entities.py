"""Rule-based named-entity and structured-information extraction.

Each extractor returns values together with the CV lines that support them. When something cannot be
found, the value is ``None`` ("Not found in CV") — extractors never guess.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date

from .preprocessing import Section, inline_labelled_lines, match_heading, section_lines, section_of_line

# ---------------------------------------------------------------- helpers


def field(value, evidence: list[dict] | None = None, method: str = "rule", confidence: str = "medium") -> dict:
    if value is None:
        return {"value": None, "evidence": [], "method": method, "confidence": "low"}
    return {"value": value, "evidence": evidence or [], "method": method, "confidence": confidence}


def evidence(lines: list[str], sections: list[Section], line_no: int) -> dict:
    return {"text": lines[line_no - 1], "section": section_of_line(sections, line_no), "line": line_no}


def _is_bullet(line: str) -> bool:
    return line.startswith("- ")


# ---------------------------------------------------------------- dates

MONTHS = {
    "jan": 1, "january": 1, "januari": 1,
    "feb": 2, "february": 2, "februari": 2, "pebruari": 2,
    "mar": 3, "march": 3, "maret": 3,
    "apr": 4, "april": 4,
    "may": 5, "mei": 5,
    "jun": 6, "june": 6, "juni": 6,
    "jul": 7, "july": 7, "juli": 7,
    "aug": 8, "august": 8, "agustus": 8, "agu": 8, "agt": 8, "ags": 8,
    "sep": 9, "sept": 9, "september": 9,
    "oct": 10, "october": 10, "oktober": 10, "okt": 10,
    "nov": 11, "november": 11, "nopember": 11,
    "dec": 12, "december": 12, "desember": 12, "des": 12,
}
_MONTH_RE = "|".join(sorted(MONTHS, key=len, reverse=True))
_DATE = rf"(?:(?:{_MONTH_RE})\.?,?\s+(?:19|20)\d{{2}}|(?:0?[1-9]|1[0-2])\s*[/.\-]\s*(?:19|20)\d{{2}}|(?:19|20)\d{{2}}\s*[/.\-]\s*(?:0?[1-9]|1[0-2])(?!\d)|(?:19|20)\d{{2}})"
_PRESENT = r"(?:present|current|now|today|ongoing|sekarang|saat\s+ini|kini|masih\s+bekerja)"
_RANGE_SEP = r"(?:\s*(?:-|–|—|~|to|until|till|s/d|s\.d\.?|sd|sampai(?:\s+dengan)?|hingga)\s*)"
DATE_RANGE_RE = re.compile(rf"(?P<start>{_DATE}){_RANGE_SEP}(?P<end>{_DATE}|{_PRESENT})", re.IGNORECASE)
_PRESENT_RE = re.compile(_PRESENT, re.IGNORECASE)


@dataclass
class ParsedDate:
    year: int
    month: int | None  # None => year-only precision

    def iso(self) -> str:
        return f"{self.year:04d}-{self.month:02d}" if self.month else f"{self.year:04d}"

    def month_index(self, end: bool = False) -> int:
        # Year-only dates are anchored at January (start) and January (end) to avoid overcounting.
        return self.year * 12 + ((self.month or 1) - 1)


def parse_date(text: str) -> ParsedDate | None:
    t = text.strip().lower().replace(",", " ")
    m = re.match(rf"({_MONTH_RE})\.?\s+((?:19|20)\d{{2}})$", t)
    if m:
        return ParsedDate(int(m.group(2)), MONTHS[m.group(1)])
    m = re.match(r"(0?[1-9]|1[0-2])\s*[/.\-]\s*((?:19|20)\d{2})$", t)
    if m:
        return ParsedDate(int(m.group(2)), int(m.group(1)))
    m = re.match(r"((?:19|20)\d{2})\s*[/.\-]\s*(0?[1-9]|1[0-2])$", t)
    if m:
        return ParsedDate(int(m.group(1)), int(m.group(2)))
    m = re.match(r"((?:19|20)\d{2})$", t)
    if m:
        return ParsedDate(int(m.group(1)), None)
    return None


# ---------------------------------------------------------------- contact info

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
PHONE_RE = re.compile(r"(?<![\d\w])(?:\+?62|0)[\s\-.]?\(?8\d{1,2}\)?(?:[\s\-.]?\d{2,4}){2,4}(?!\d)|\+\d{1,3}[\s\-.]?\(?\d{1,4}\)?(?:[\s\-.]?\d{2,4}){2,4}(?!\d)")
LABELLED_RE = re.compile(r"^(?P<label>name|nama|nama lengkap|full name|address|alamat|location|lokasi|domisili|city|kota)\s*[:：]\s*(?P<value>.+)$", re.IGNORECASE)

CITIES = [
    "Jakarta", "Jakarta Selatan", "Jakarta Pusat", "Jakarta Barat", "Jakarta Timur", "Jakarta Utara", "Surabaya",
    "Bandung", "Medan", "Semarang", "Yogyakarta", "Jogjakarta", "Makassar", "Denpasar", "Bali", "Malang", "Bekasi",
    "Tangerang", "Tangerang Selatan", "Depok", "Bogor", "Batam", "Palembang", "Balikpapan", "Sidoarjo", "Solo",
    "Surakarta", "Pekanbaru", "Padang", "Pontianak", "Manado", "Samarinda", "Banjarmasin", "Cirebon", "Gresik",
    "Singapore", "Kuala Lumpur", "Remote",
]
_CITY_RE = re.compile(r"\b(" + "|".join(sorted((re.escape(c) for c in CITIES), key=len, reverse=True)) + r")\b")

NON_NAME_WORDS = {
    "curriculum", "vitae", "resume", "cv", "profile", "profil", "contact", "kontak", "email", "phone", "telp",
    "address", "alamat", "summary", "linkedin", "github", "portfolio",
}


def extract_email(lines, sections):
    for i, line in enumerate(lines, start=1):
        m = EMAIL_RE.search(line)
        if m:
            return field(m.group(0).lower(), [evidence(lines, sections, i)], "regex", "high")
    return field(None, method="regex")


def extract_phone(lines, sections):
    for i, line in enumerate(lines, start=1):
        if DATE_RANGE_RE.search(line) and not re.search(r"(phone|telp|hp|mobile|wa|whatsapp|tel)", line, re.I):
            continue
        for m in PHONE_RE.finditer(line):
            digits = re.sub(r"\D", "", m.group(0))
            if 9 <= len(digits) <= 15:
                return field(m.group(0).strip(), [evidence(lines, sections, i)], "regex", "high")
    return field(None, method="regex")


def _looks_like_name(text: str) -> bool:
    text = text.strip()
    if not text or any(ch.isdigit() for ch in text) or "@" in text or "http" in text.lower():
        return False
    words = [w for w in re.split(r"\s+", text) if w]
    if not 2 <= len(words) <= 5:
        return False
    if any(w.lower().strip(".,") in NON_NAME_WORDS for w in words):
        return False
    if match_heading(text):
        return False
    if any(re.search(rf"\b{re.escape(k)}\b", text, re.I) for k in TITLE_KEYWORDS):
        return False
    letters = [w for w in words if re.fullmatch(r"[A-Za-zÀ-ÿ'.\-]+", w)]
    if len(letters) != len(words):
        return False
    return all(w[0].isupper() for w in words)


def extract_name(lines, sections):
    for i, line in enumerate(lines[:40], start=1):
        m = LABELLED_RE.match(line)
        if m and m.group("label").lower() in {"name", "nama", "nama lengkap", "full name"}:
            value = m.group("value").strip()
            if _looks_like_name(value) or len(value.split()) == 1:
                return field(value.title() if value.isupper() else value, [evidence(lines, sections, i)], "rule:label", "high")
    header_end = next((s.end_line for s in sections if s.name == "header"), min(8, len(lines)))
    for i in range(1, min(header_end, 8) + 1):
        line = lines[i - 1]
        # Lines like "John Doe | Data Analyst" — take the part before a separator.
        candidate = re.split(r"\s+[|•·–—-]\s+|,", line)[0].strip()
        if _looks_like_name(candidate):
            value = candidate.title() if candidate.isupper() else candidate
            return field(value, [evidence(lines, sections, i)], "rule:header", "medium")
    return field(None, method="rule:header")


def extract_location(lines, sections):
    for i, line in enumerate(lines[:60], start=1):
        m = LABELLED_RE.match(line)
        if m and m.group("label").lower() in {"address", "alamat", "location", "lokasi", "domisili", "city", "kota"}:
            city = _CITY_RE.search(m.group("value"))
            value = city.group(1) if city else m.group("value").strip()[:120]
            return field(value, [evidence(lines, sections, i)], "rule:label", "high" if city else "medium")
    header = next((s for s in sections if s.name == "header"), None)
    if header:
        for i in range(header.start_line, min(header.end_line, header.start_line + 10) + 1):
            m = _CITY_RE.search(lines[i - 1])
            if m:
                return field(m.group(1), [evidence(lines, sections, i)], "rule:gazetteer", "medium")
    return field(None, method="rule:gazetteer")


def extract_summary(lines, sections):
    content = [(n, t) for n, t in section_lines(lines, sections, "summary") if t]
    if not content:
        return field(None, method="rule:section")
    text = " ".join(t.lstrip("- ") for _, t in content)
    if len(text) > 700:
        text = text[:700].rsplit(" ", 1)[0] + " …"
    return field(text, [evidence(lines, sections, n) for n, _ in content[:3]], "rule:section", "high")


# ---------------------------------------------------------------- experience

TITLE_KEYWORDS = [
    "engineer", "developer", "programmer", "manager", "analyst", "scientist", "consultant", "specialist",
    "officer", "designer", "architect", "administrator", "admin", "lead", "head", "director", "intern", "internship",
    "assistant", "associate", "supervisor", "coordinator", "executive", "staff", "representative", "accountant",
    "auditor", "recruiter", "trainer", "teacher", "lecturer", "researcher", "technician", "operator", "cashier",
    "marketing", "sales", "owner", "founder", "co-founder", "president", "vice president", "vp", "cto", "ceo", "cfo",
    "coo", "product owner", "scrum master", "tester", "qa", "devops", "sre", "magang", "kepala", "manajer",
    "direktur", "asisten", "pengembang", "teknisi", "guru", "dosen", "freelance", "freelancer", "secretary",
    "sekretaris", "generalist", "partner", "advisor", "strategist", "writer", "editor",
]
_TITLE_RE = re.compile(r"\b(" + "|".join(re.escape(k) for k in TITLE_KEYWORDS) + r")\b", re.IGNORECASE)
ORG_MARKERS = [
    "pt", "pt.", "cv", "cv.", "tbk", "inc", "inc.", "ltd", "ltd.", "llc", "corp", "corporation", "company", "co.",
    "group", "bank", "persero", "universitas", "university", "institut", "institute", "studio", "labs", "lab",
    "technologies", "technology", "tech", "consulting", "solutions", "digital", "indonesia", "international",
    "foundation", "yayasan", "agency", "startup", "gmbh", "pte", "sdn bhd", "bhd", "hospital", "rumah sakit",
    "koperasi", "kementerian", "ministry", "dinas", "badan", "telkom", "gojek", "tokopedia", "shopee", "traveloka",
    "bukalapak", "grab", "unilever", "pertamina",
]
_ORG_RE = re.compile(r"(?<![A-Za-z])(" + "|".join(re.escape(k) for k in ORG_MARKERS) + r")(?![A-Za-z])", re.IGNORECASE)
_SPLIT_HEADER_RE = re.compile(r"\s+(?:at|@|di)\s+|\s*[|•·]\s*|\s+[–—-]\s+|,\s+")


def _classify_header_parts(parts: list[str]) -> tuple[str | None, str | None]:
    parts = [p.strip(" -|,") for p in parts if p and p.strip(" -|,")]
    parts = [p for p in parts if not _CITY_RE.fullmatch(p) and p.lower() not in {"indonesia", "remote"}]
    title = company = None
    for p in parts:
        is_org = bool(_ORG_RE.search(p))
        is_title = bool(_TITLE_RE.search(p))
        if is_org and not company and (not is_title or p.split()[0].lower().strip(".") in {"pt", "cv"}):
            company = p
        elif is_title and not title:
            title = p
    rest = [p for p in parts if p not in (title, company)]
    if title is None and rest:
        title = rest.pop(0) if company else None
    if company is None and rest:
        company = rest.pop(0)
    if title is None and company is None and parts:
        title = parts[0]
    return title, company


def extract_experience(lines: list[str], sections: list[Section]) -> tuple[list[dict], int | None, str]:
    exp_lines = section_lines(lines, sections, "experience")
    if not exp_lines:
        return [], None, "No work experience section was detected."
    anchors = [(n, t, DATE_RANGE_RE.search(t)) for n, t in exp_lines]
    anchors = [(n, t, m) for n, t, m in anchors if m]
    line_numbers = [n for n, _ in exp_lines]
    entries: list[dict] = []
    used_header_lines: set[int] = set()

    for idx, (line_no, text, match) in enumerate(anchors):
        header_parts: list[str] = []
        evidence_lines = [line_no]
        remainder = (text[: match.start()] + " " + text[match.end():]).strip(" -|,()[]")
        remainder = re.sub(r"\(\s*\)|\[\s*\]", "", remainder).strip(" -|,")
        if remainder:
            header_parts.extend(_SPLIT_HEADER_RE.split(remainder))
        # Look back up to two preceding non-bullet lines for title/company.
        pos = line_numbers.index(line_no)
        prev_anchor_line = anchors[idx - 1][0] if idx > 0 else 0
        look = pos - 1
        taken = 0
        while look >= 0 and taken < 2:
            prev_no, prev_text = exp_lines[look]
            if prev_no <= prev_anchor_line or prev_no in used_header_lines:
                break
            if not prev_text:
                if taken:
                    break
                look -= 1
                continue
            if _is_bullet(prev_text) or len(prev_text) > 90 or prev_text.endswith("."):
                break
            header_parts = _SPLIT_HEADER_RE.split(prev_text) + header_parts
            evidence_lines.insert(0, prev_no)
            used_header_lines.add(prev_no)
            taken += 1
            look -= 1
        title, company = _classify_header_parts(header_parts)

        start = parse_date(match.group("start"))
        end_raw = match.group("end")
        is_current = bool(_PRESENT_RE.fullmatch(end_raw.strip()))
        end = None if is_current else parse_date(end_raw)

        # Description: lines after the anchor up to the next entry's header block.
        next_anchor = anchors[idx + 1][0] if idx + 1 < len(anchors) else None
        desc: list[tuple[int, str]] = []
        for n, t in exp_lines[pos + 1:]:
            if next_anchor is not None and n >= next_anchor:
                break
            desc.append((n, t))
        # Trim trailing non-bullet lines that are actually the next entry's header.
        if next_anchor is not None:
            while desc and (not desc[-1][1] or (not _is_bullet(desc[-1][1]) and len(desc[-1][1]) <= 90 and not desc[-1][1].endswith("."))):
                desc.pop()
        description = " ".join(t.lstrip("- ") for _, t in desc if t) or None
        if description and len(description) > 900:
            description = description[:900].rsplit(" ", 1)[0] + " …"

        duration = None
        if start:
            end_idx = (date.today().year * 12 + date.today().month - 1) if is_current else (end.month_index() if end else None)
            if end_idx is not None and end_idx >= start.month_index():
                duration = end_idx - start.month_index() + (1 if (start.month and (is_current or (end and end.month))) else 0)

        entries.append({
            "title": title,
            "company": company,
            "start": start.iso() if start else None,
            "end": "present" if is_current else (end.iso() if end else None),
            "is_current": is_current,
            "duration_months": duration,
            "description": description,
            "evidence": [evidence(lines, sections, n) for n in evidence_lines] +
                        [evidence(lines, sections, n) for n, t in desc[:2] if t],
            "_interval": (start, end, is_current),
        })

    total, note = _total_experience(entries)
    for e in entries:
        e.pop("_interval", None)
    if not anchors:
        note = "Work experience section found, but no date ranges could be identified."
    return entries, total, note


def _total_experience(entries: list[dict]) -> tuple[int | None, str]:
    today_idx = date.today().year * 12 + date.today().month - 1
    intervals: list[tuple[int, int]] = []
    year_only = 0
    skipped = 0
    for e in entries:
        start, end, current = e["_interval"]
        if not start or (not end and not current):
            skipped += 1
            continue
        s = start.month_index()
        f = today_idx if current else end.month_index()
        if start.month is None or (end is not None and end.month is None):
            year_only += 1
        if f < s:
            skipped += 1
            continue
        intervals.append((s, f + (0 if (start.month is None) else 1)))
    if not intervals:
        return None, "Total experience not calculated: no entries with clear start and end dates."
    intervals.sort()
    merged: list[list[int]] = [list(intervals[0])]
    overlap = False
    for s, f in intervals[1:]:
        if s < merged[-1][1]:
            overlap = True
            merged[-1][1] = max(merged[-1][1], f)
        else:
            merged.append([s, f])
    total = sum(f - s for s, f in merged)
    notes = [f"Calculated from {len(intervals)} dated position(s)"]
    if overlap:
        notes.append("overlapping periods were counted once")
    if year_only:
        notes.append(f"{year_only} position(s) have year-only dates, so the total is approximate")
    if skipped:
        notes.append(f"{skipped} position(s) without clear dates were excluded")
    return total, "; ".join(notes) + "."


# ---------------------------------------------------------------- education

DEGREE_PATTERNS: list[tuple[str, str]] = [
    (r"\b(ph\.?\s?d|doctor of|doktor|s3|dr\.)\b", "doctorate"),
    (r"\b(master(?:'s)?|magister|m\.?\s?sc|msc|m\.?\s?eng|mba|m\.?\s?kom|m\.?\s?m\b|m\.?\s?t\b|s2|m\.?\s?a\b)", "master"),
    (r"\b(bachelor(?:'s)?|sarjana|b\.?\s?sc|bsc|b\.?\s?eng|b\.?\s?a\b|b\.?\s?s\b|b\.?\s?com|s1|s\.?\s?kom|s\.?\s?t\b|s\.?\s?e\b|s\.?\s?si|s\.?\s?psi|s\.?\s?h\b|s\.?\s?ikom|undergraduate|d4|diploma iv)\b", "bachelor"),
    (r"\b(diploma|associate degree|d3|d2|d1|a\.?\s?md)\b", "diploma"),
    (r"\b(sma|smk|ma|high school|senior high|vocational high school|stm)\b", "high_school"),
]
INSTITUTION_RE = re.compile(
    r"\b(universitas|university|univ\.|institut|institute|politeknik|polytechnic|college|sekolah tinggi|stmik|stie|"
    r"akademi|academy|school|sma|smk|binus|its|itb|ugm|ui|unair|undip|unpad|telkom university)\b",
    re.IGNORECASE,
)
GPA_RE = re.compile(r"\b(?:gpa|ipk)\s*[:=]?\s*(\d[.,]\d{1,2})(\s*/\s*\d(?:[.,]0+)?)?", re.IGNORECASE)
YEAR_RE = re.compile(r"\b(19[6-9]\d|20[0-4]\d)\b")
LEVEL_RANK = {"none": 0, "high_school": 1, "diploma": 2, "bachelor": 3, "master": 4, "doctorate": 5}


def _degree_level(text: str) -> tuple[str | None, str | None]:
    for pattern, level in DEGREE_PATTERNS:
        m = re.search(pattern, text, re.IGNORECASE)
        if m:
            return level, m.group(0)
    return None, None


def extract_education(lines: list[str], sections: list[Section]) -> list[dict]:
    edu = [(n, t) for n, t in section_lines(lines, sections, "education")]
    if not edu:
        return []
    # Group lines into blocks: a new block starts at an institution line once the current block has one.
    blocks: list[list[tuple[int, str]]] = []
    current: list[tuple[int, str]] = []
    has_inst = False
    for n, t in edu:
        if not t:
            if current:
                blocks.append(current)
                current, has_inst = [], False
            continue
        is_inst = bool(INSTITUTION_RE.search(t))
        is_degree = _degree_level(t)[0] is not None
        if current and ((is_inst and has_inst) or (is_degree and has_inst and any(_degree_level(x)[0] for _, x in current))):
            blocks.append(current)
            current, has_inst = [], False
        current.append((n, t))
        has_inst = has_inst or is_inst
    if current:
        blocks.append(current)

    entries = []
    for block in blocks:
        text = " | ".join(t for _, t in block)
        level, degree_token = _degree_level(text)
        inst_line = next((t for _, t in block if INSTITUTION_RE.search(t)), None)
        institution = None
        if inst_line:
            institution = re.split(r"\s*[|•·]\s*|\s+[–—-]\s+|,\s+(?=\d)|\(", inst_line)[0]
            institution = YEAR_RE.sub("", DATE_RANGE_RE.sub("", institution)).strip(" -,|")
            if level and degree_token and institution.lower().startswith(degree_token.lower()):
                institution = institution[len(degree_token):].strip(" -,|")
        field_of_study = None
        if degree_token:
            m = re.search(re.escape(degree_token) + r"\.?\s*(?:of|in|degree in|jurusan|program studi|prodi|-|,|:)?\s*(?P<f>[A-Za-z][A-Za-z &/]+)", text, re.IGNORECASE)
            if m:
                candidate = m.group("f").strip()
                if not INSTITUTION_RE.search(candidate) and 2 < len(candidate) < 80:
                    field_of_study = candidate.strip()
        if not level and not institution:
            continue
        years = [int(y) for y in YEAR_RE.findall(text)]
        gpa = GPA_RE.search(text)
        entries.append({
            "level": level,
            "degree": degree_token.strip() if degree_token else None,
            "field": field_of_study,
            "institution": institution or None,
            "start_year": min(years) if len(years) >= 2 else None,
            "end_year": max(years) if years else None,
            "gpa": (gpa.group(1).replace(",", ".") + (gpa.group(2) or "").replace(" ", "")) if gpa else None,
            "evidence": [evidence(lines, sections, n) for n, _ in block[:3]],
        })
    return entries


def highest_education_level(entries: list[dict]) -> str | None:
    levels = [e["level"] for e in entries if e.get("level")]
    return max(levels, key=lambda lv: LEVEL_RANK[lv]) if levels else None


# ---------------------------------------------------------------- certifications & languages

LANGUAGE_NAMES = {
    "english": "English", "inggris": "English", "bahasa inggris": "English",
    "indonesian": "Indonesian", "bahasa indonesia": "Indonesian", "indonesia": "Indonesian",
    "mandarin": "Mandarin", "chinese": "Mandarin", "japanese": "Japanese", "jepang": "Japanese",
    "korean": "Korean", "korea": "Korean", "arabic": "Arabic", "arab": "Arabic", "german": "German",
    "jerman": "German", "french": "French", "perancis": "French", "dutch": "Dutch", "belanda": "Dutch",
    "spanish": "Spanish", "javanese": "Javanese", "jawa": "Javanese", "sundanese": "Sundanese", "malay": "Malay",
}
_LANG_RE = re.compile(r"\b(" + "|".join(sorted((re.escape(k) for k in LANGUAGE_NAMES), key=len, reverse=True)) + r")\b(?:\s*[\(:\-–]\s*(?P<level>[A-Za-z ]{3,30})\)?)?", re.IGNORECASE)
_TEST_SCORE_RE = re.compile(r"\b(toefl|ielts|toeic|jlpt|hsk|topik)\b[^,;|]*", re.IGNORECASE)


def extract_certifications(lines, sections) -> list[dict]:
    out = []
    seen = set()
    for n, t in section_lines(lines, sections, "certifications"):
        value = t.lstrip("- ").strip()
        if not value or len(value) > 160 or len(value) < 3:
            continue
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(field(value, [evidence(lines, sections, n)], "rule:section", "medium"))
    return out


def extract_languages(lines, sections) -> list[dict]:
    candidates = section_lines(lines, sections, "languages") + inline_labelled_lines(lines, "languages")
    out: dict[str, dict] = {}
    for n, t in candidates:
        for m in _LANG_RE.finditer(t):
            name = LANGUAGE_NAMES[m.group(1).lower()]
            level = (m.group("level") or "").strip()
            value = f"{name} ({level.title()})" if level and not _LANG_RE.fullmatch(level) else name
            out.setdefault(name, field(value, [evidence(lines, sections, n)], "rule:section", "high"))
        for m in _TEST_SCORE_RE.finditer(t):
            out.setdefault(m.group(0).strip(), field(m.group(0).strip(), [evidence(lines, sections, n)], "rule:section", "high"))
    return list(out.values())
