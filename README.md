# XORCA Talent Intelligence — Prototype

A standalone prototype for AI-assisted recruitment. It has three parts:

- **Public application forms**: HR builds an application form per job, choosing which fields applicants fill in. Name, email, phone and CV are always included. HR then shares the public link (`/apply/<code>`). Applicants apply without an account. Each submission creates the candidate and application automatically, and the CV goes straight into the NLP pipeline and screening.
- **AI CV Intelligence**: upload a PDF or DOCX CV. A Python NLP pipeline extracts a structured profile, normalizes skills, and matches the candidate against a job's criteria. Every match comes with CV evidence and an explanation.
- **Shortlist and email invitations**: HR ranks screened candidates by match score, shortlists e.g. the top 10, and emails each of them an AI interview link in one step.
- **AI Interview (Meet-style, Bahasa Indonesia)**: a video-call-style room where the candidate can turn the mic, camera and screen sharing on or off. The AI interviewer reads its questions aloud in Indonesian. Each candidate first gets questions generated from their own CV, then the HR-approved template questions. Answers can be spoken (browser speech-to-text) or typed. Each interview is evaluated against the rubric, and every score is backed by quotes from the candidate's answers.

AI output supports HR decisions; it never makes them. Scores show how well a CV matches the job criteria, not how likely a candidate is to succeed. Candidates are never rejected automatically.

```
frontend/   React + TypeScript + Vite + Tailwind + Recharts   (http://localhost:5173)
backend/    Flask REST API + Swagger (Flask-RESTX), SQLAlchemy, Alembic, NLP pipeline   (http://localhost:5001)
docs/       API endpoint reference (contract shared with frontend/src/types/api.ts)
```

## Quick start (local)

Prerequisites: Python 3.12+ (developed on 3.14), Node 20+, and PostgreSQL 14+ running locally.

```bash
# 1) Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate      # or: uv venv && uv pip install -r requirements.txt
pip install -r requirements.txt
cp .env.example .env            # then set DATABASE_URL, FRONTEND_URL and optional keys
createdb xorca_ti               # and createdb xorca_ti_test for the test suite
flask --app app:create_app db upgrade   # applies migrations
flask --app app:create_app seed-demo    # demo jobs and synthetic CVs, processed by the real pipeline
python wsgi.py                  # API on http://localhost:5001, Swagger UI at http://localhost:5001/docs

# 2) Frontend (new terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api to :5001)
```

There is no login: the app opens straight to the HR dashboard and every HR action is available. Authentication and user permissions belong to the central system that this API is handed to (see [Deployment requirements for the central system](#deployment-requirements-for-the-central-system)). To record who did something, send the optional `X-Actor-Name` / `X-Actor-Id` headers; without them actions are attributed to `HR`.

To recreate the demo data, run `flask --app app:create_app seed-demo --reset`; it only deletes records flagged as demo. Demo records carry an `is_demo` flag, and the UI labels them as demo data. Sample CV files are written to `backend/sample_cvs/` by `python -m scripts.sample_cvs`. Every person and company in them is fictional.

### Optional capabilities

| Capability | How to enable | Without it |
|---|---|---|
| LLM (Claude) | Set `ANTHROPIC_API_KEY` in `backend/.env` (`LLM_MODEL` defaults to `claude-opus-5-5`) | CV extraction is rule-based only. Interview follow-ups use rules. Interview evaluation collects evidence but leaves scoring to HR. |
| Interviewer voice (server TTS) | A Gemini key: `TTS_API_KEY`, or automatically the LLM / fallback key when that provider is `gemini`. `TTS_MODEL` (default `gemini-3.8-flash-lite-tts`, retried once with `TTS_FALLBACK_MODEL` `gemini-3.8-flash-tts`), `TTS_VOICE` (default `Kore`), `TTS_TIMEOUT_SECONDS` (30); `TTS_PROVIDER=none` disables it | The browser's own speech synthesis reads the questions (needs an installed `id-ID` voice, e.g. Chrome's "Google Bahasa Indonesia"); without one, questions are shown as captions only |
| OCR for scanned PDFs | `pip install pytesseract pdf2image` and install the `tesseract` binary (with the `ind` language) | A scanned PDF fails with a clear `ocr_required` error, telling the user to upload a text-based PDF or DOCX |
| Email (interview invitations) | Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `MAIL_FROM` in `backend/.env`. For Gmail, use an App Password. | Emails are logged as `not_configured` and HR copies the links manually |
| Automatic AI-interview invitations | On by default. `AUTO_INVITE_HOUR` (default `8`, WIB), `AUTO_INVITE_INTERVAL_SECONDS` (default `300`); set `AUTO_INVITE_ENABLED=false` to turn the scheduler off | Per job (job form → *Auto-invite*): at 08:00 WIB the day after the deadline, the top N screened applicants (default 10, optional minimum score; failed must-have questions and already-invited applicants excluded) are shortlisted and emailed an AI interview link using the job's approved template. HR can press *Send now* or invite manually any time |
| Neural semantic similarity | `pip install sentence-transformers` and set `EMBEDDING_MODEL` (e.g. `paraphrase-multilingual-MiniLM-L12-v2`) | TF-IDF lexical similarity, clearly labelled `tfidf-lexical` |

**Before sending real CVs to an LLM provider, check the provider's data-retention terms.** The same applies to server TTS: the interviewer's question text is sent to Google (Gemini) to be spoken, and CV-based questions may contain personal data from the CV. During development, use synthetic CVs or CVs whose owners have authorized this use.

## Tests

```bash
cd backend && pytest            # NLP units, matching, API (no login, actor attribution), application forms, interview flow, Swagger
cd frontend && npm test         # Vitest + React Testing Library
cd frontend && npm run build    # type-check + production build
```

## Application forms

- **Field types:** short text, long text, email, phone, number, date, URL, dropdown, multiple choice, checkbox and yes/no. Fields can be required or optional, with help text, a placeholder and a maximum length. Validation runs both in the browser and on the server, and errors are reported per field.
- **Form lifecycle:** draft → published → closed. Draft forms aren't reachable publicly, and an optional deadline closes the form automatically. *Regenerate link* invalidates a link that was shared somewhere it shouldn't be.
- **Returning applicants:** an applicant is matched to an existing candidate by email, so one person can apply to several jobs. Applying twice to the same job is rejected.
- **Stored answers:** each application keeps its answers together with the field labels as they were at submission time, so later edits to the form don't change past answers.
- **Abuse protection:** a honeypot field, a per-IP rate limit (`FORM_SUBMISSIONS_PER_IP_PER_HOUR`, default 30), file validation, and a required privacy consent. Behind a reverse proxy, enable werkzeug `ProxyFix` so the real client IP is used.
- **Manual upload:** HR can still add a CV by hand from the job page, for example for referrals.

## How the NLP pipeline works

The pipeline lives in `backend/app/nlp/pipeline.py`. Each step is timed and recorded, and the steps are shown on the **NLP Processing** tab.

1. **validate**: detects the type from file content (magic bytes) and checks it against the extension. It enforces the 10 MB and page limits, guards against zip bombs, and rejects legacy `.doc` files.
2. **extract_text**: uses `pdfplumber` for PDFs. For DOCX it uses `python-docx`, walking the document body in order so tables and headers are kept.
3. **ocr**: when a PDF has almost no text layer, the pipeline runs Tesseract if it is installed. Otherwise it reports `ocr_required`.
4. **preprocess**: Unicode normalization, bullet and whitespace cleanup, and fixing words hyphenated across line breaks. Line numbers are preserved so evidence can point back to the source.
5. **sections**: detects headings in English and Indonesian (Experience/Pengalaman Kerja, Education/Pendidikan, Skills/Keahlian, …).
6. **entities**: rule-based NER. Regexes find email, phone (Indonesian and international formats) and dates (EN/ID month names, `MM/YYYY`, "Present/Sekarang"). Gazetteers find locations. Title and organisation markers (PT, Tbk, Universitas, …) help identify roles and employers.
7. **skills**: a taxonomy of 177 skills and 366 aliases (`app/nlp/data/skills_taxonomy.json`), e.g. `sklearn → scikit-learn`, `Postgre SQL → PostgreSQL`, `rekrutmen → Recruitment`. The original text and the CV line are always kept. Short or ambiguous terms ("Go", "R", "excel") only count inside a skills list. Items listed under Skills that aren't in the taxonomy are kept but flagged as *not normalized*.
8. **experience / education**: date ranges are parsed into positions. Total experience is computed only from dated positions, with overlapping periods counted once. Year-only dates are flagged as approximate. Degree levels are recognised from both English and Indonesian forms (S1/S2/D3/Bachelor/Master, …).
9. **llm_extraction** (optional): Claude proposes structured JSON, validated against a schema. **A value is accepted only if it appears verbatim in the CV line it cites.** LLM values fill gaps and never overwrite rule-based results. Timeouts, rate limits, refusals and invalid responses are recorded, and the pipeline falls back to the rule-based results.

Information that isn't found is stored as `null` and shown as **"Not found in CV"**. Nothing is inferred.

### Screening and scoring

The scoring logic is in `backend/app/nlp/matching.py`. Each requirement gets one of three statuses:

- **Matched**: shown with evidence and *how* it matched (exact, normalized, or computed).
- **Not Found in CV**
- **Needs Review**: a related skill only (e.g. PostgreSQL listed when the job asks for SQL), an ambiguous field of study, or dates that can't be resolved.

The overall score is a weighted average of six components: required skills, preferred skills, experience, education, certifications, and text similarity. Each job has its own configurable weights. A component that can't be computed, such as experience with no dated positions, is **excluded** and the remaining weights are renormalised, and the report says so. Text similarity is calibrated and weighted at only 10% by default; it is a supporting signal only. Employment gaps are reported for context and never scored.

Identical inputs (the same CV, criteria, HR corrections and pipeline version) return the existing result instead of re-running. HR corrections and reviews are stored separately from the AI output, and every important action is written to `ti_audit_logs`.

### End-to-end recruitment flow

1. **Create the job:** HR creates the job and publishes its application form, which gives a public link.
2. **Candidates apply:** candidates fill in the form and upload their CV. The CV is processed and screened automatically.
3. **Shortlist:** HR reviews the ranking, picks the top N (for example 10), and shortlists them. Moving candidates between stages is always an HR decision.
4. **Invite:** with **Invite to AI interview**, each shortlisted candidate gets a personal link by email. When SMTP isn't configured, the links are shown once for HR to share manually.
5. **Interview:** the candidate joins the Meet-style room and answers by voice or text.
6. **Review:** HR reviews the transcript, the per-competency evaluation, and the CV questions with the CV lines they were based on.

### Interviews

- **Voice and video in the browser:**
  - The interviewer's voice is synthesized on the server (Gemini TTS) when configured: every interviewer message is pre-generated by the background worker as soon as it is created, cached privately under `storage/tts/`, and played by the browser from `GET /candidate-interview/messages/{id}/audio`. If that fails (e.g. free-tier rate limit) the browser's speech synthesis is used (an `id-ID` voice when one is installed), and otherwise captions only.
  - Speech-to-text uses the Web Speech API, which works best in Chrome or Edge. In Chrome, audio is processed by Google's speech service, and the privacy notice says so. Typing is always available as a fallback.
  - Camera and screen sharing are shown **only on the candidate's own device**. They are never recorded, uploaded or analysed; facial and emotion analysis is out of scope by design.
- **CV-based questions:** each session asks 0–5 personalised questions first (default 2), for example about the latest role, a required skill shown in the CV, or a required skill missing from it. Each question stores the CV line it is based on. With an LLM configured, the questions are generated by the model, and any question whose quoted CV text can't be found in the CV is discarded. CV questions are scored under an automatic competency, "Pendalaman Pengalaman CV".
- HR creates a template for a job. **Suggest from job** uses the LLM, or a built-in competency library when no LLM is configured. HR edits the template and **approves** it; only approved templates can be used for invitations, and editing a template sends it back to draft.
- An invitation creates a random 256-bit token. **Only its SHA-256 hash is stored.** The link is `/interview#<token>`: the token sits in the URL fragment, which is never sent to servers, so it can't appear in access logs. The candidate's browser sends it in the `X-Interview-Token` header. Links expire and can be revoked.
- The chatbot asks the template's questions in order, with at most N follow-ups per question. Follow-ups are decided by the LLM, or by rules: a short answer, or no outcome mentioned. The interview ends after the last question, at the time limit, or when the candidate or HR ends it.
- **Evaluation:** the LLM scores each rubric competency from 1 to 5 with verbatim quotes. A quote that can't be found in the candidate's answers is discarded, and a competency without verified evidence gets **no score** and is flagged as insufficient evidence. Without an LLM, the evaluation collects evidence only and leaves scoring to HR. Answer length and fluency are explicitly not treated as evidence.

## API

Swagger UI is at `http://localhost:5001/docs` (short for `/api/v1/talent/docs`); the raw spec is at `/api/v1/talent/swagger.json`. The endpoint reference is in [docs/api-endpoints.md](docs/api-endpoints.md). Every error has the form `{"error": {"code", "message", "details"}}`. CV processing is asynchronous: an upload returns `202`, and the client polls `GET /documents/{id}/status`.

## Deployment requirements for the central system

Only the backend API is handed over; the central system's frontend team builds on it, and **the central system handles authentication and user permissions**. The API itself has no login, roles or tokens for HR users, so every HR endpoint is open to whoever can reach it. Before going live:

- **Never expose this API to the public internet.** Restrict network access to the central system / its API gateway: a private network, a firewall or security group, or gateway-only ingress.
- **The gateway authenticates and authorises** every HR request before forwarding it.
- **Set `FRONTEND_URL`** to the central frontend's origin. It is the only CORS origin allowed and the base URL of the interview links emailed to candidates.
- **Terminate HTTPS at the gateway.** If TLS ends at a proxy in front of the API, set `HSTS_ENABLED=true` (or `FORCE_HTTPS=true`).
- **Forward `X-Actor-Name` (and optionally `X-Actor-Id`)** from the authenticated user so the audit log, decisions, stage history, reviews, template approvals and settings changes show who acted. Strip any client-supplied values at the gateway so they always reflect the authenticated user — the API treats them as attribution only, never as authorization (max 255 characters; default actor `HR`).
- **Candidate-facing routes** are the only ones meant for applicants: `/api/v1/talent/public/forms/...` (public application form, rate-limited with honeypot and consent) and `/api/v1/talent/candidate-interview...` (protected by the `X-Interview-Token` from the invitation link). If candidates must reach them from the internet, expose only those paths through the gateway.

Database migrations: `flask --app app:create_app db upgrade` (migration `d4e8b2a6f1c3_remove_hr_login` drops the old login columns and keeps `ti_users` as the actors table).

## Security & privacy

**Settings → Security & privacy** (Bahasa Indonesia, for clients) summarises the protections that exist today and marks production plans separately; the same text is in [docs/keamanan-dan-privasi-data.md](docs/keamanan-dan-privasi-data.md). Keep both in sync when protections change.

### Security headers

The API adds security headers to every response (`apply_security_headers` in `backend/app/__init__.py`, details in [docs/api-endpoints.md](docs/api-endpoints.md#security-headers-every-response)): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer` (interview links carry the token in the URL fragment), `Permissions-Policy` (camera/microphone for the app itself only), `Cross-Origin-Opener-Policy: same-origin`, a deny-all CSP and `Cache-Control: no-store` on API responses (the Swagger UI gets a CSP that lets it load), and HSTS over HTTPS or when `HSTS_ENABLED=true` (TLS terminated by a proxy).

The frontend is a static build served by the client's own web server. Recommended headers for it:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' <API origin>; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(self), microphone=(self), geolocation=()
Cross-Origin-Opener-Policy: same-origin
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Adjust `font-src`/`style-src` if fonts are self-hosted, and `connect-src` to the API's origin. Keep `Referrer-Policy: no-referrer` so `/interview#<token>` links never leak. `index.html` should be served with `Cache-Control: no-cache`; hashed assets under `/assets/` can be cached long-term.

## Architecture notes and prototype limitations

- **Background work** (CV processing, interview evaluation) runs in a thread pool inside the API process (`app/worker.py`). Job state is kept in the database, and interrupted jobs are re-queued on startup. For production, replace it with RQ or Celery behind the same `submit()` function.
- **Uploaded CVs** are stored in a private directory (`DOCUMENT_STORAGE_DIR`) with `0600` permissions. No route serves them; HR sees the extracted text through the HR API (reachable only via the central gateway). For production, use a private object-storage bucket.
- **Authentication** is not part of this service: the central system authenticates users and controls permissions, and the API must only be reachable through it (see [Deployment requirements](#deployment-requirements-for-the-central-system)). `X-Actor-Name`/`X-Actor-Id` are used for attribution only.
- **NER** is rule-based. The adapter boundaries (`nlp/`, `llm/adapter.py`, `nlp/semantic.py`) allow a statistical NER model, another LLM provider, or neural embeddings to be added without changing the API.
- **Duplicate candidates** across separate uploads aren't merged automatically yet. A repeated upload of the *same file* to the same application is detected by hash and not reprocessed.
- **Retention:** HR sets the rules in **Settings → Data retention** (off by default): delete applicant data N months (1–36) after the job closes, optionally keeping hired candidates; applicants with an interview in progress are skipped. The in-process scheduler applies it once a day at `RETENTION_HOUR` (02:00 WIB); "Run now" applies it immediately. Deletion uses the same cascade as deleting a candidate, and the audit log only records counts. The actual retention period still needs to be agreed with legal/HR before real candidate data is used.
