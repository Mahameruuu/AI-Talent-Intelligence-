"""Unit tests for the NLP pipeline components (no database)."""

import io

import pytest

from app.llm.adapter import LLMAdapter, LLMError
from app.nlp import entities
from app.nlp.llm_extraction import LLMCVExtraction
from app.nlp.pipeline import process_document
from app.nlp.preprocessing import clean_text, detect_sections
from app.nlp.skills import extract_skills, normalize_skill
from app.nlp.text_extraction import DocumentError, validate_upload
from tests.conftest import sample_bytes

MB = 1024 * 1024


def run(text: str):
    lines = clean_text(text).split("\n")
    return lines, detect_sections(lines)


@pytest.mark.parametrize("raw,expected", [
    ("sklearn", "scikit-learn"),
    ("JS", "JavaScript"),
    ("Postgre SQL", "PostgreSQL"),
    ("PyTorch framework", "PyTorch"),
    ("ReactJS", "React"),
    ("Python (Advanced)", "Python"),
    ("Bahasa Inggris", "English"),
    ("not a real skill", None),
])
def test_normalize_skill(raw, expected):
    assert normalize_skill(raw) == expected


def test_skill_extraction_keeps_original_and_evidence():
    lines, sections = run("Jane Doe\n\nSkills\nsklearn, Postgre SQL, PyTorch framework, Storybook\n")
    skills = {s["normalized"]: s for s in extract_skills(lines, sections)}
    assert skills["scikit-learn"]["original"] == "sklearn"
    assert skills["scikit-learn"]["method"] == "alias"
    assert skills["PostgreSQL"]["original"] == "Postgre SQL"
    assert skills["PyTorch"]["evidence"][0]["section"] == "skills"
    # Unknown terms listed under Skills are kept, but flagged as not normalized.
    assert skills["Storybook"]["in_taxonomy"] is False


def test_ambiguous_terms_only_counted_in_skills_section():
    lines, sections = run("Jane Doe\n\nSummary\nI excel in teamwork and go the extra mile.\n\nSkills\nGo, R\n")
    names = {s["normalized"] for s in extract_skills(lines, sections)}
    assert {"Go", "R"} <= names
    assert "Microsoft Excel" not in names
    lines, sections = run("Jane Doe\n\nSummary\nI excel in teamwork and go the extra mile.\n")
    names = {s["normalized"] for s in extract_skills(lines, sections)}
    assert "Go" not in names and "Microsoft Excel" not in names


def test_company_names_are_not_skills():
    lines, sections = run("Jane Doe\n\nExperience\nHR Staff\nPT Sinar Logistik Nusantara\nJan 2020 - Present\n")
    assert "Supply Chain Management" not in {s["normalized"] for s in extract_skills(lines, sections)}


def test_indonesian_sections_and_dates():
    text = ("Nama: Siti Aminah\nEmail: siti@example.com\n\nPengalaman Kerja\nStaff Rekrutmen\nPT Contoh Jaya\n"
            "Maret 2017 - Desember 2019\n- Rekrutmen kandidat\n\nPendidikan\nUniversitas Airlangga\nS1 Psikologi, 2013 - 2017\n")
    lines, sections = run(text)
    assert {"experience", "education"} <= {s.name for s in sections}
    exp, total, _ = entities.extract_experience(lines, sections)
    assert exp[0]["start"] == "2017-03" and exp[0]["end"] == "2019-12"
    assert exp[0]["company"] == "PT Contoh Jaya" and exp[0]["title"] == "Staff Rekrutmen"
    assert total == 34
    edu = entities.extract_education(lines, sections)
    assert edu[0]["level"] == "bachelor" and edu[0]["institution"] == "Universitas Airlangga"
    assert entities.extract_name(lines, sections)["value"] == "Siti Aminah"


def test_overlapping_experience_not_double_counted():
    text = ("John Doe\n\nExperience\nEngineer - PT A\nJan 2020 - Dec 2020\n- work\n"
            "Consultant - PT B\nJun 2020 - Jun 2021\n- work\n")
    lines, sections = run(text)
    _, total, note = entities.extract_experience(lines, sections)
    assert total == 18  # Jan 2020 .. Jun 2021, overlap counted once
    assert "overlapping" in note


def test_undated_experience_is_not_guessed():
    lines, sections = run("John Doe\n\nExperience\nEngineer at PT A\n- built things\n")
    entries, total, note = entities.extract_experience(lines, sections)
    assert total is None
    assert "no date ranges" in note.lower()


def test_missing_fields_are_none_not_invented():
    lines, sections = run("Professional Summary\nExperienced analyst.\n\nSkills\nPython\n")
    assert entities.extract_email(lines, sections)["value"] is None
    assert entities.extract_phone(lines, sections)["value"] is None
    assert entities.extract_name(lines, sections)["value"] is None


def test_phone_not_confused_with_year_ranges():
    lines, sections = run("John Doe\n\nEducation\nUniversity of X 2014 - 2018\n")
    assert entities.extract_phone(lines, sections)["value"] is None


def test_validate_upload_rejects_bad_files():
    with pytest.raises(DocumentError) as e:
        validate_upload("cv.pdf", b"", MB)
    assert e.value.code == "empty_file"
    with pytest.raises(DocumentError) as e:
        validate_upload("cv.exe", b"MZ\x90\x00binary", MB)
    assert e.value.code == "unsupported_type"
    name, data = sample_bytes("rina")
    with pytest.raises(DocumentError) as e:
        validate_upload("cv.docx", data, 10 * MB)
    assert e.value.code == "extension_mismatch"
    with pytest.raises(DocumentError) as e:
        validate_upload(name, data, 100)
    assert e.value.code == "file_too_large"


def _blank_pdf() -> bytes:
    from fpdf import FPDF

    pdf = FPDF()
    pdf.add_page()
    pdf.rect(10, 10, 50, 50)  # an image-like page with no text layer
    return bytes(pdf.output())


def test_scanned_pdf_reports_ocr_requirement():
    result = process_document("scan.pdf", _blank_pdf(), max_bytes=10 * MB, max_pages=15, llm=LLMAdapter())
    assert result.status == "failed"
    assert result.error_code in ("ocr_required", "ocr_failed")
    assert result.steps[-1]["status"] == "failed"


@pytest.mark.parametrize("prefix", ["rina", "budi", "siti", "andi", "dewi", "agus"])
def test_pipeline_on_sample_cvs(prefix):
    name, data = sample_bytes(prefix)
    result = process_document(name, data, max_bytes=10 * MB, max_pages=15, llm=LLMAdapter())
    assert result.status == "completed", result.error_message
    ext = result.extraction
    assert ext["name"]["value"] and ext["email"]["value"]
    assert ext["experience"] and ext["education"]
    assert [s["name"] for s in result.steps][:3] == ["validate", "extract_text", "ocr"]
    llm_step = next(s for s in result.steps if s["name"] == "llm_extraction")
    assert llm_step["status"] == "skipped"
    # Every evidence excerpt must be a real line of the cleaned text.
    lines = result.clean_text.split("\n")
    for skill in ext["skills"]:
        for ev in skill["evidence"]:
            assert lines[ev["line"] - 1] == ev["text"]


class FakeLLM(LLMAdapter):
    provider, model = "fake", "fake-model"

    def __init__(self, payload=None, error=None):
        self.payload, self.error = payload, error

    @property
    def enabled(self):
        return True

    def describe(self):
        return "fake-model"

    def generate_json(self, *, system, prompt, schema, max_tokens=8000, effort="low", **_):
        if self.error:
            raise self.error
        return schema.model_validate(self.payload)


def test_llm_values_are_verified_against_cv_text():
    text = "Skills\nPython, Storybook\n\nExperience\nWorked on dashboards.\n"
    payload = {
        "name": {"value": "Invented Person", "line": 1},  # not in the CV -> must be rejected
        "email": {"value": None, "line": None}, "phone": {"value": None, "line": None},
        "location": {"value": None, "line": None},
        "skills": [{"original": "Storybook", "line": 2}, {"original": "Kubernetes", "line": 2}],
        "experience": [], "education": [], "certifications": [],
    }
    LLMCVExtraction.model_validate(payload)
    data = io.BytesIO()
    import docx

    d = docx.Document()
    for line in text.split("\n"):
        d.add_paragraph(line)
    d.save(data)
    result = process_document("cv.docx", data.getvalue(), max_bytes=10 * MB, max_pages=15, llm=FakeLLM(payload))
    assert result.status == "completed"
    ext = result.extraction
    assert ext["name"]["value"] is None  # hallucinated name rejected
    names = {s["normalized"] for s in ext["skills"]}
    assert "Kubernetes" not in names  # not in CV text
    step = next(s for s in result.steps if s["name"] == "llm_extraction")
    assert step["status"] == "ok" and "rejected" in step["detail"]


def test_llm_failure_falls_back_to_rules():
    name, data = sample_bytes("budi")
    llm = FakeLLM(error=LLMError("timeout", "The LLM provider did not respond in time."))
    result = process_document(name, data, max_bytes=10 * MB, max_pages=15, llm=llm)
    assert result.status == "completed"
    step = next(s for s in result.steps if s["name"] == "llm_extraction")
    assert step["status"] == "warning" and "timeout" in step["detail"]
    assert result.methods["llm"] == "failed: timeout"
