"""Outgoing email over SMTP. Every attempt is recorded in ti_email_logs with secrets redacted.

When SMTP is not configured the email is not sent; the log entry says so and callers return the link to
HR so it can be shared another way.
"""

from __future__ import annotations

import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from flask import current_app

from ..extensions import db
from ..models import EmailLog

log = logging.getLogger(__name__)


def smtp_configured() -> bool:
    return bool(current_app.config["SMTP_HOST"] and current_app.config["MAIL_FROM"])


def send(*, to: str, subject: str, text: str, html_body: str, kind: str, redact: list[str] | None = None,
         session_id: int | None = None, created_by_id: int | None = None) -> EmailLog:
    """Send an email (if SMTP is configured) and record it. Never raises for delivery problems."""
    redacted = text
    for secret in redact or []:
        redacted = redacted.replace(secret, "[redacted]")
    entry = EmailLog(to_email=to, subject=subject, body_redacted=redacted, kind=kind, session_id=session_id,
                     created_by_id=created_by_id, status="not_configured")
    db.session.add(entry)
    if not smtp_configured():
        entry.error = "SMTP is not configured (set SMTP_HOST and MAIL_FROM)."
        return entry

    cfg = current_app.config
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = formataddr((cfg["MAIL_FROM_NAME"], cfg["MAIL_FROM"]))
    msg["To"] = to
    msg["Message-ID"] = make_msgid(domain=cfg["MAIL_FROM"].split("@")[-1])
    msg.set_content(text)
    msg.add_alternative(html_body, subtype="html")
    try:
        if cfg["SMTP_USE_SSL"]:
            server = smtplib.SMTP_SSL(cfg["SMTP_HOST"], cfg["SMTP_PORT"], timeout=15, context=ssl.create_default_context())
        else:
            server = smtplib.SMTP(cfg["SMTP_HOST"], cfg["SMTP_PORT"], timeout=15)
        with server:
            if cfg["SMTP_USE_TLS"] and not cfg["SMTP_USE_SSL"]:
                server.starttls(context=ssl.create_default_context())
            if cfg["SMTP_USER"]:
                server.login(cfg["SMTP_USER"], cfg["SMTP_PASSWORD"])
            server.send_message(msg)
        entry.status, entry.error = "sent", None
    except (OSError, smtplib.SMTPException) as exc:
        log.warning("Email delivery failed (%s): %s", kind, type(exc).__name__)
        entry.status, entry.error = "failed", f"{type(exc).__name__}: {exc}"[:500]
    return entry


def interview_invitation(*, to: str, candidate_name: str, job_title: str, company: str, url: str,
                         expires_text: str, duration_minutes: int, questions: int) -> tuple[str, str, str]:
    """Return (subject, text, html) for an AI interview invitation in Bahasa Indonesia."""
    subject = f"Undangan AI Interview – {job_title} | {company}"
    text = (
        f"Halo {candidate_name},\n\n"
        f"Terima kasih telah melamar posisi {job_title} di {company}. Selamat, Anda terpilih untuk melanjutkan ke "
        f"tahap AI Interview.\n\n"
        f"Wawancara dilakukan secara online bersama pewawancara AI dalam Bahasa Indonesia: sekitar {questions} "
        f"pertanyaan, kurang lebih {duration_minutes} menit. Anda dapat menjawab dengan suara (mikrofon) atau "
        f"mengetik.\n\n"
        f"Mulai wawancara: {url}\n"
        f"Link berlaku sampai {expires_text}. Jangan bagikan link ini kepada orang lain.\n\n"
        "Tips:\n"
        "- Gunakan Google Chrome atau Microsoft Edge versi terbaru di laptop/komputer.\n"
        "- Pilih tempat yang tenang dan pastikan koneksi internet stabil.\n"
        "- Izinkan akses mikrofon dan kamera saat diminta browser.\n\n"
        "Hasil wawancara akan ditinjau oleh tim rekrutmen kami; keputusan akhir selalu dibuat oleh manusia.\n\n"
        f"Salam,\nTim Rekrutmen {company}"
    )
    e = html.escape
    html_body = f"""<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.55">
<p>Halo {e(candidate_name)},</p>
<p>Terima kasih telah melamar posisi <strong>{e(job_title)}</strong> di {e(company)}. Selamat, Anda terpilih untuk
melanjutkan ke tahap <strong>AI Interview</strong>.</p>
<p>Wawancara dilakukan secara online bersama pewawancara AI dalam Bahasa Indonesia: sekitar {questions} pertanyaan,
kurang lebih {duration_minutes} menit. Anda dapat menjawab dengan suara (mikrofon) atau mengetik.</p>
<p><a href="{e(url)}" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;
text-decoration:none;font-weight:bold">Mulai AI Interview</a></p>
<p style="font-size:13px;color:#475569">Link berlaku sampai {e(expires_text)}. Jangan bagikan link ini kepada orang lain.</p>
<p><strong>Tips:</strong></p>
<ul><li>Gunakan Google Chrome atau Microsoft Edge versi terbaru di laptop/komputer.</li>
<li>Pilih tempat yang tenang dan pastikan koneksi internet stabil.</li>
<li>Izinkan akses mikrofon dan kamera saat diminta browser.</li></ul>
<p style="font-size:13px;color:#475569">Hasil wawancara akan ditinjau oleh tim rekrutmen kami; keputusan akhir selalu
dibuat oleh manusia.</p>
<p>Salam,<br>Tim Rekrutmen {e(company)}</p></body></html>"""
    return subject, text, html_body
