"""Document validation and raw text extraction for PDF and DOCX files."""

from __future__ import annotations

import io
import shutil
import zipfile
from dataclasses import dataclass, field

PDF_MIME = "application/pdf"
DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

# Below this many extractable characters per page, a PDF is treated as scanned.
MIN_CHARS_PER_PAGE = 80


class DocumentError(Exception):
    """A document problem the user can understand and act on."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class ExtractedText:
    text: str
    page_count: int | None
    ocr_used: bool = False
    warnings: list[str] = field(default_factory=list)


def detect_type(filename: str, data: bytes) -> str:
    """Return the MIME type based on file *content*, cross-checked with the extension."""
    name = filename.lower()
    if data[:5] == b"%PDF-":
        if not name.endswith(".pdf"):
            raise DocumentError("extension_mismatch", "File content is PDF but the extension is not .pdf.")
        return PDF_MIME
    if data[:4] == b"PK\x03\x04":
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                names = set(zf.namelist())
                if "word/document.xml" not in names:
                    raise DocumentError("unsupported_type", "ZIP archive is not a Word (.docx) document.")
                # Guard against zip bombs: limit total uncompressed size.
                if sum(info.file_size for info in zf.infolist()) > 200 * 1024 * 1024:
                    raise DocumentError("invalid_document", "DOCX expands to an unreasonable size.")
        except zipfile.BadZipFile as exc:
            raise DocumentError("invalid_document", "DOCX file is corrupted.") from exc
        if not name.endswith(".docx"):
            raise DocumentError("extension_mismatch", "File content is DOCX but the extension is not .docx.")
        return DOCX_MIME
    if name.endswith(".doc"):
        raise DocumentError("unsupported_type", "Legacy .doc files are not supported. Please save as .docx or PDF.")
    raise DocumentError("unsupported_type", "Only PDF and DOCX files are supported.")


def validate_upload(filename: str, data: bytes, max_bytes: int) -> str:
    if not data:
        raise DocumentError("empty_file", "The uploaded file is empty.")
    if len(data) > max_bytes:
        raise DocumentError(
            "file_too_large", f"File exceeds the {max_bytes // (1024 * 1024)} MB upload limit."
        )
    return detect_type(filename, data)


def ocr_available() -> tuple[bool, str]:
    try:
        import pytesseract  # noqa: F401
        import pdf2image  # noqa: F401
    except ImportError:
        return False, "pytesseract/pdf2image not installed"
    if shutil.which("tesseract") is None:
        return False, "tesseract binary not found on PATH"
    return True, "tesseract (eng+ind)"


def _extract_pdf(data: bytes, max_pages: int) -> ExtractedText:
    import pdfplumber

    try:
        pdf = pdfplumber.open(io.BytesIO(data))
    except Exception as exc:  # pdfminer raises a variety of exception types
        raise DocumentError("invalid_document", "PDF could not be opened (corrupted or encrypted).") from exc
    with pdf:
        page_count = len(pdf.pages)
        if page_count == 0:
            raise DocumentError("invalid_document", "PDF has no pages.")
        if page_count > max_pages:
            raise DocumentError("too_many_pages", f"PDF has {page_count} pages; the limit for a CV is {max_pages}.")
        pages: list[str] = []
        for page in pdf.pages:
            # layout=False keeps reading order simple; x_tolerance avoids merged words.
            pages.append(page.extract_text(x_tolerance=1.5, y_tolerance=3) or "")
    text = "\n\n".join(pages)
    return ExtractedText(text=text, page_count=page_count)


def _ocr_pdf(data: bytes) -> str:
    import pytesseract
    from pdf2image import convert_from_bytes

    images = convert_from_bytes(data, dpi=300)
    return "\n\n".join(pytesseract.image_to_string(img, lang="eng+ind") for img in images)


def _extract_docx(data: bytes) -> ExtractedText:
    import docx

    try:
        document = docx.Document(io.BytesIO(data))
    except Exception as exc:
        raise DocumentError("invalid_document", "DOCX could not be opened.") from exc

    lines: list[str] = []
    # Iterate the body in document order so tables stay where they appear.
    body = document.element.body
    for child in body.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            text = "".join(node.text or "" for node in child.iter() if node.tag.endswith("}t"))
            lines.append(text)
        elif tag == "tbl":
            for row in child.iter():
                if not row.tag.endswith("}tr"):
                    continue
                cells = []
                for cell in row.iterchildren():
                    if cell.tag.endswith("}tc"):
                        cell_text = " ".join(
                            "".join(n.text or "" for n in p.iter() if n.tag.endswith("}t"))
                            for p in cell.iter()
                            if p.tag.endswith("}p")
                        ).strip()
                        if cell_text and cell_text not in cells:
                            cells.append(cell_text)
                if cells:
                    lines.append(" | ".join(cells))
    # Headers often carry the candidate's name and contacts.
    header_lines: list[str] = []
    for section in document.sections:
        for p in section.header.paragraphs:
            if p.text.strip():
                header_lines.append(p.text)
    return ExtractedText(text="\n".join(header_lines + lines), page_count=None)


def extract_text(data: bytes, mime_type: str, max_pages: int = 15) -> ExtractedText:
    if mime_type == DOCX_MIME:
        result = _extract_docx(data)
    elif mime_type == PDF_MIME:
        result = _extract_pdf(data, max_pages)
        chars = len("".join(result.text.split()))
        if chars < MIN_CHARS_PER_PAGE * max(1, result.page_count or 1) * 0.5:
            available, detail = ocr_available()
            if not available:
                raise DocumentError(
                    "ocr_required",
                    "This PDF appears to be scanned (no selectable text) and OCR is not available on the server "
                    f"({detail}). Upload a text-based PDF or DOCX, or ask an administrator to enable OCR.",
                )
            ocr_text = _ocr_pdf(data)
            if len("".join(ocr_text.split())) <= chars:
                raise DocumentError("ocr_failed", "OCR could not read text from this scanned PDF.")
            result = ExtractedText(text=ocr_text, page_count=result.page_count, ocr_used=True,
                                   warnings=["Text was obtained with OCR; verify extracted values carefully."])
    else:
        raise DocumentError("unsupported_type", "Only PDF and DOCX files are supported.")

    if len(result.text.strip()) < 50:
        raise DocumentError("no_text", "Almost no text could be extracted from this document.")
    return result
