import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "postgresql+psycopg://localhost/xorca_ti")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    DOCUMENT_STORAGE_DIR = str((BASE_DIR / os.getenv("DOCUMENT_STORAGE_DIR", "storage/documents")).resolve())
    MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "10"))
    # Allow a little headroom for the multipart envelope; the file itself is checked separately.
    MAX_CONTENT_LENGTH = (MAX_UPLOAD_MB + 1) * 1024 * 1024
    MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "15"))

    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
    COMPANY_NAME = os.getenv("COMPANY_NAME", "XORCA")
    # Timezone for job application periods (a deadline date is open until 23:59 in this zone).
    TIMEZONE = os.getenv("TIMEZONE", "Asia/Jakarta")

    # LLM provider: "anthropic" (Claude), or an OpenAI-compatible one: "groq", "ollama", "openrouter", "gemini",
    # "openai_compatible" (custom LLM_BASE_URL). "none" disables the LLM (rule-based only).
    LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    LLM_API_KEY = os.getenv("LLM_API_KEY", "")  # key for OpenAI-compatible providers (not needed for Ollama)
    LLM_BASE_URL = os.getenv("LLM_BASE_URL", "")  # optional; sensible default per provider
    LLM_MODEL = os.getenv("LLM_MODEL", "claude-opus-5-5")
    # Optional backup provider, used automatically when the primary fails (quota exhausted, error, timeout).
    LLM_FALLBACK_PROVIDER = os.getenv("LLM_FALLBACK_PROVIDER", "")
    LLM_FALLBACK_API_KEY = os.getenv("LLM_FALLBACK_API_KEY", "")
    LLM_FALLBACK_MODEL = os.getenv("LLM_FALLBACK_MODEL", "")
    LLM_FALLBACK_BASE_URL = os.getenv("LLM_FALLBACK_BASE_URL", "")
    LLM_TIMEOUT_SECONDS = float(os.getenv("LLM_TIMEOUT_SECONDS", "60"))
    LLM_ENABLE_CV_EXTRACTION = _bool("LLM_ENABLE_CV_EXTRACTION", True)
    # Conversational interview: max seconds to wait for one interviewer turn before using the scripted fallback.
    CONVERSATION_LLM_TIMEOUT_SECONDS = float(os.getenv("CONVERSATION_LLM_TIMEOUT_SECONDS", "12"))

    # Server-side text-to-speech for the AI interviewer's voice (Gemini TTS). The key defaults to whichever
    # configured LLM key belongs to Gemini; without one the browser's own speech synthesis is used.
    TTS_API_KEY = (os.getenv("TTS_API_KEY", "")
                   or (LLM_API_KEY if LLM_PROVIDER == "gemini" else "")
                   or (LLM_FALLBACK_API_KEY if LLM_FALLBACK_PROVIDER == "gemini" else ""))
    TTS_PROVIDER = (os.getenv("TTS_PROVIDER", "") or ("gemini" if TTS_API_KEY else "none")).strip().lower()
    TTS_MODEL = os.getenv("TTS_MODEL", "gemini-3.8-flash-lite-tts")
    TTS_FALLBACK_MODEL = os.getenv("TTS_FALLBACK_MODEL", "gemini-3.8-flash-tts")
    TTS_VOICE = os.getenv("TTS_VOICE", "Kore")
    TTS_TIMEOUT_SECONDS = float(os.getenv("TTS_TIMEOUT_SECONDS", "30"))
    # Private cache of synthesized interviewer audio (never served statically).
    TTS_CACHE_DIR = str((BASE_DIR / os.getenv("TTS_CACHE_DIR", "storage/tts")).resolve())

    # Outgoing email (interview invitations). Leave SMTP_HOST empty to only log emails.
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    SMTP_USE_TLS = _bool("SMTP_USE_TLS", True)
    SMTP_USE_SSL = _bool("SMTP_USE_SSL", False)
    MAIL_FROM = os.getenv("MAIL_FROM", "")
    MAIL_FROM_NAME = os.getenv("MAIL_FROM_NAME", "XORCA Recruitment")

    EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "")
    # Abuse protection for the public application form.
    FORM_SUBMISSIONS_PER_IP_PER_HOUR = int(os.getenv("FORM_SUBMISSIONS_PER_IP_PER_HOUR", "30"))
    WORKER_MAX_WORKERS = int(os.getenv("WORKER_MAX_WORKERS", "2"))
    # Run background jobs inline (used by tests for determinism).
    WORKER_INLINE = False
    # Automatic AI-interview invitations: per job either at AUTO_INVITE_HOUR (local TIMEZONE) on the day after
    # closes_on ("next_morning") or right after the closing moment ("on_close"). The in-process scheduler checks
    # every AUTO_INVITE_INTERVAL_SECONDS (a tick with nothing due is a single small query).
    AUTO_INVITE_ENABLED = _bool("AUTO_INVITE_ENABLED", True)
    AUTO_INVITE_HOUR = int(os.getenv("AUTO_INVITE_HOUR", "8"))
    AUTO_INVITE_INTERVAL_SECONDS = int(os.getenv("AUTO_INVITE_INTERVAL_SECONDS", "60"))

    # Data retention (rules are set by HR in Settings): the scheduler applies them once a day at
    # RETENTION_HOUR (local TIMEZONE). RETENTION_SCHEDULER_ENABLED=false stops only the daily run.
    RETENTION_SCHEDULER_ENABLED = _bool("RETENTION_SCHEDULER_ENABLED", True)
    RETENTION_HOUR = int(os.getenv("RETENTION_HOUR", "2"))

    # Send Strict-Transport-Security even when the app sees plain HTTP (TLS terminated by a proxy).
    HSTS_ENABLED = _bool("HSTS_ENABLED", False) or _bool("FORCE_HTTPS", False)

    RESTX_MASK_SWAGGER = False
    RESTX_ERROR_404_HELP = False
    ERROR_INCLUDE_MESSAGE = False  # keep error bodies to {"error": {...}} only


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.getenv("TEST_DATABASE_URL", "postgresql+psycopg://localhost/xorca_ti_test")
    ANTHROPIC_API_KEY = ""
    LLM_PROVIDER = "none"
    LLM_FALLBACK_PROVIDER = ""
    TTS_PROVIDER = "none"  # tests enable it explicitly and mock the HTTP call
    TTS_API_KEY = ""
    WORKER_INLINE = True
    SMTP_HOST = ""
    FORM_SUBMISSIONS_PER_IP_PER_HOUR = 10
    AUTO_INVITE_ENABLED = False  # the scheduler thread never runs in tests; tick() is called directly
    RETENTION_SCHEDULER_ENABLED = False
    HSTS_ENABLED = False
