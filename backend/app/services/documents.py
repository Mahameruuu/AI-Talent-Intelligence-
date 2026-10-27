from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timezone

from flask import current_app

from ..errors import ApiError
from ..extensions import db
from ..llm.adapter import get_llm
from ..models import Application, Document
from ..nlp.pipeline import PIPELINE_VERSION, process_document
from ..nlp.text_extraction import DOCX_MIME, DocumentError, validate_upload
from ..worker import worker
from . import audit, storage

log = logging.getLogger(__name__)


def create_document(application: Application, filename: str, data: bytes, uploaded_by_id: int | None) -> tuple[Document, bool]:
    """Validate, store privately and queue a CV for processing. Returns (document, created)."""
    max_bytes = current_app.config["MAX_UPLOAD_MB"] * 1024 * 1024
    safe_name = (filename or "cv").replace("/", "_").replace("\\", "_")[-200:]
    try:
        mime = validate_upload(safe_name, data, max_bytes)
    except DocumentError as exc:
        status = 413 if exc.code == "file_too_large" else 400
        raise ApiError(status, exc.code, exc.message) from exc

    sha = hashlib.sha256(data).hexdigest()
    existing = Document.query.filter_by(application_id=application.id, sha256=sha).first()
    if existing:
        # Same file uploaded again for this application: reuse the result instead of reprocessing.
        return existing, False

    key = storage.save(data, ".docx" if mime == DOCX_MIME else ".pdf")
    doc = Document(
        application_id=application.id,
        candidate_id=application.candidate_id,
        filename=safe_name,
        mime_type=mime,
        size_bytes=len(data),
        sha256=sha,
        storage_key=key,
        status="queued",
        pipeline_version=PIPELINE_VERSION,
        uploaded_by_id=uploaded_by_id,
    )
    db.session.add(doc)
    db.session.flush()
    audit.record("document.uploaded", "document", doc.id,
                 {"application_id": application.id, "size_bytes": len(data), "mime_type": mime})
    db.session.commit()
    enqueue(doc.id)
    return doc, True


def enqueue(document_id: int) -> None:
    worker.submit(f"document:{document_id}", process_document_job, document_id)


def reprocess(doc: Document) -> Document:
    if doc.status in ("queued", "processing"):
        return doc
    doc.status = "queued"
    doc.error_code = doc.error_message = None
    audit.record("document.reprocess_requested", "document", doc.id)
    db.session.commit()
    enqueue(doc.id)
    return doc


def process_document_job(document_id: int) -> None:
    doc = db.session.get(Document, document_id)
    if doc is None or doc.status != "queued":
        return  # already handled (idempotent)
    doc.status = "processing"
    db.session.commit()

    cfg = current_app.config
    try:
        data = storage.load(doc.storage_key)
    except (OSError, ValueError):
        doc.status, doc.error_code = "failed", "storage_error"
        doc.error_message = "The stored file could not be read."
        doc.processed_at = datetime.now(timezone.utc)
        db.session.commit()
        return

    result = process_document(
        doc.filename, data,
        max_bytes=cfg["MAX_UPLOAD_MB"] * 1024 * 1024,
        max_pages=cfg["MAX_PDF_PAGES"],
        llm=get_llm(),
        use_llm=cfg["LLM_ENABLE_CV_EXTRACTION"],
    )
    doc.status = result.status
    doc.steps = result.steps
    doc.methods = result.methods
    doc.page_count = result.page_count
    doc.ocr_used = result.ocr_used
    doc.clean_text = result.clean_text
    doc.sections = result.sections
    doc.extraction = result.extraction
    doc.error_code = result.error_code
    doc.error_message = result.error_message
    doc.processing_ms = result.processing_ms
    doc.pipeline_version = PIPELINE_VERSION
    doc.processed_at = datetime.now(timezone.utc)

    candidate = doc.candidate
    if result.status == "completed" and result.extraction:
        ext = result.extraction
        if candidate.name_pending:
            name = ext["name"]["value"]
            candidate.full_name = name or f"Unnamed candidate ({doc.filename})"
            candidate.name_pending = False
        if not candidate.email and ext["email"]["value"]:
            candidate.email = ext["email"]["value"]
        if not candidate.phone and ext["phone"]["value"]:
            candidate.phone = ext["phone"]["value"]
    elif candidate.name_pending:
        candidate.full_name = f"Unprocessed CV ({doc.filename})"
        candidate.name_pending = False

    audit.record("document.processed", "document", doc.id,
                 {"status": result.status, "error_code": result.error_code, "processing_ms": result.processing_ms},
                 actor_label="nlp-pipeline")
    db.session.commit()

    if result.status == "completed":
        from .screening import run_screening

        try:
            run_screening(doc.application, document=doc, actor_label="nlp-pipeline")
        except ApiError as exc:
            log.warning("Automatic screening skipped for document %s: %s", doc.id, exc.code)
