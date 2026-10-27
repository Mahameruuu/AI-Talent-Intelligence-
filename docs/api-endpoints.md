# XORCA Talent Intelligence — REST endpoints

Base URL: `/api/v1/talent` (Vite dev server proxies `/api` to `http://localhost:5001`).
Swagger UI: `http://localhost:5001/docs` (redirects to `/api/v1/talent/docs`).
Types referenced below live in `frontend/src/types/api.ts`.

Errors: HTTP 4xx/5xx with body `ApiErrorBody` (`{ "error": { "code", "message", "details" } }`).
List endpoints accept `page` (1-based) and `page_size` (default 20, max 100) and return `Paginated<T>`.

## Authentication: none — handled by the central system
This API has no login, passwords, roles or tokens for HR users. It is delivered to the central system, whose frontend calls it; **sign-in and user permissions are handled by the central system**. Every HR endpoint is open to any caller that can reach it, so:
- Deploy it on a private network / behind the central API gateway only — never expose it to the public internet (see "Deployment requirements for the central system" in the root `README.md`).
- The only public-facing routes are the candidate ones: `/public/forms/...` (rate-limited, honeypot, consent) and `/candidate-interview...` (require `X-Interview-Token`).

### Actor attribution (optional headers)
| Header | Value |
|---|---|
| `X-Actor-Name` | Display name of the person acting (free text) |
| `X-Actor-Id` | Optional stable id from the central system (free text) |

- **Attribution only, never authorization** — the values are untrusted. The gateway should set them from the authenticated user and strip any client-supplied values.
- Max 255 characters (longer values are truncated; control characters are stripped).
- Recorded as: audit log actor, HR decision `decided_by`, stage history `changed_by`, HR review `reviewer_name`, template `approved_by`, evaluation `reviewed_by`, settings `updated_by`.
- Actors are found or created in `ti_users` (`id, full_name, external_id, created_at`): by `X-Actor-Id` when given (its name is updated to the latest `X-Actor-Name`), otherwise by name. Without headers the built-in actor `HR` is used.

```bash
curl -X PATCH http://localhost:5001/api/v1/talent/applications/12 \
  -H "Content-Type: application/json" -H "X-Actor-Name: Rina Putri" -H "X-Actor-Id: emp-0042" \
  -d '{"stage": "shortlisted", "note": "Strong CV"}'
```

CORS allows the origin `FRONTEND_URL` only, with headers `Content-Type, X-Interview-Token, X-Actor-Name, X-Actor-Id`.

## Jobs
| GET | `/jobs?status=&q=` | – | `Paginated<Job>` |
| POST | `/jobs` | `JobInput` | `Job` (201) |
| GET | `/jobs/{id}` | – | `Job` |
| PATCH | `/jobs/{id}` | partial `JobInput` (set `status: "closed"` to close) | `Job` |
| DELETE | `/jobs/{id}?force=` | – | 204 — deletes the job with its application form and interview templates. A job with applications → 409 `job_has_applications` (close it instead) unless `force=true`, which also deletes its applications (CVs, screenings, interviews; candidate profiles are kept). Audit `job.deleted` |
| POST | `/jobs/{id}/auto-invite/run` | – | `Job` — "Send now": runs the auto-invite selection immediately, regardless of the date and even after a previous run (only applicants without an interview invitation are invited). 409 `no_approved_template` without an approved template; 409 `auto_invite_running` while a batch is being sent |
| GET | `/jobs/{id}/applications?stage=&min_score=&sort=score|created` | – | `Paginated<Application>` |

### Automatic AI-interview invitations (`Job.auto_invite`)
Invitations go out automatically **after** the application period closes, e.g. applications 26–30 Oct → links emailed on 31 Oct at 08:00 WIB (`AUTO_INVITE_HOUR`, organisation `TIMEZONE`). HR can still invite manually at any time.

`JobInput` accepts an optional nested `"auto_invite": {"enabled"?: bool, "top_n"?: int 1..100, "min_score"?: float 0..100 | null}` on `POST`/`PATCH /jobs` (omitted keys are unchanged; invalid values → 400 with `details[].field` like `auto_invite.top_n`). New jobs default to `enabled: true, top_n: 10, min_score: null`.

`Job.auto_invite` in responses:
```json
{
  "enabled": true,
  "top_n": 10,
  "min_score": null,
  "send_at": "2026-10-31T08:00:00+07:00",
  "status": "scheduled",
  "template_id": 3,
  "template_name": "Data Scientist — AI Interview",
  "ran_at": null,
  "invited_count": null,
  "skipped": null,
  "error": null
}
```
- `send_at`: `closes_on` + 1 day at `AUTO_INVITE_HOUR` (WIB, with offset); `null` without `closes_on`.
- `status`: `disabled` (not enabled) → `sent` (a run completed; never re-sent automatically, even if `closes_on` is moved later) → `failed` (last run errored, see `error`; retried on the next scheduler tick) → `no_deadline` → `waiting_template` (no approved interview template yet; it sends on the first tick after one is approved) → `scheduled`.
- `template_id`/`template_name`: the approved template that will be used (the job's most recently approved/updated one), or the one that was used once sent.
- After a run: `ran_at` (ISO, WIB), `invited_count`, `skipped: {knockout, below_min_score, not_screened, already_invited, beyond_top_n}`.

Selection: applications in `applied`/`screening`/`shortlisted` with a completed screening, no failed must-have (knockout) screening question, score ≥ `min_score` (if set) and no interview session yet; sorted by `match_score` desc, then oldest application first; the top `top_n` are moved to `shortlisted` (stage history note "Shortlisted automatically after applications closed.") and invited with email through the same code path as bulk invite (an individual email failure is logged in the email log and doesn't stop the batch). If CVs are still queued/processing at `send_at`, the scheduler waits up to 2 hours, then counts them as `not_screened`. Every run is audit-logged as `interviews.auto_invite_run` (actor `auto-invite-scheduler` for scheduled runs).

The scheduler runs inside the API process (`AUTO_INVITE_ENABLED`, `AUTO_INVITE_INTERVAL_SECONDS`, default 300 s); each job's batch is claimed atomically in the database, so several processes never send twice.

## Application forms (HR)
One form per job. Built-in fields `full_name`, `email`, `phone` and the CV upload are always present and required; HR configures any number of custom fields (`FormField`).
| GET | `/forms` | – | `ApplicationForm[]` (all jobs, with `submission_count`) |
| GET | `/jobs/{id}/form` | – | `ApplicationForm` (404 `not_found` if the job has no form yet) |
| POST | `/jobs/{id}/form` | – | `ApplicationForm` (201, status `draft`, pre-filled with suggested custom fields; 409 `form_exists`) |
| PUT | `/jobs/{id}/form` | `ApplicationFormInput` | `ApplicationForm` (400 with a message for invalid field definitions) |
| POST | `/jobs/{id}/form/publish` | – | `ApplicationForm` (public link starts accepting; 409 `job_closed` if the job is closed) |
| POST | `/jobs/{id}/form/close` | – | `ApplicationForm` |
| POST | `/jobs/{id}/form/regenerate-link` | – | `ApplicationForm` (new `slug`/`public_url`; old link stops working) |

## Public application (candidates; no account)
The public page is `/apply/:slug` in the frontend.
| GET | `/public/forms/{slug}` | – | `PublicApplicationForm` (404 if unknown or still draft; closed forms return `accepting_applications: false`) |
| POST | `/public/forms/{slug}/submit` | multipart: `answers` (JSON string object keyed by field id, incl. `full_name`, `email`, `phone`), `consent` (`"true"`), `cv` (file), `website` (honeypot — must stay empty) | `ApplicationSubmitted` (201). Errors: 400 `validation_error` with `details.fields: {field_id: message}` (CV errors under `cv`); 400 `consent_required`; 409 `already_applied`; 410 `form_closed`; 413 `file_too_large`; 429 `rate_limited` |

Submissions create (or reuse, by email) the candidate and the application (`source: "public_form"`, `form_answers`), then the CV is processed and screened automatically.

## Candidates
| GET | `/candidates?q=&job_id=&stage=&min_score=&max_score=&doc_status=` | – | `Paginated<CandidateSummary>` — `q` searches name, email and skills |
| POST | `/candidates` | `{full_name, email?, phone?}` | `Candidate` (201) |
| GET | `/candidates/{id}` | – | `Candidate` |
| DELETE | `/candidates/{id}` | – | 204 — permanently deletes the candidate and all their data: applications, documents (DB rows + stored CV files), screening results, HR reviews, stage history, interview sessions/messages/evaluations and their email logs. Open interview links stop working (candidate endpoints answer 401 `invalid_token`). Audit `candidate.deleted` with `{candidate_id, applications, documents, interview_sessions}` only (no personal data). 404 if unknown |
| PATCH | `/candidates/{id}/corrections` | `CandidateProfileCorrections` | `Candidate` (HR corrections stored separately from AI output) |
| POST | `/candidates/upload` | multipart: `file`, `job_id` | `{candidate: Candidate, application: Application, document: DocumentInfo}` (202) — creates candidate+application from a CV; candidate name is filled from extraction when processing finishes |

## Applications
| GET | `/applications?job_id=&stage=&q=&sort=score|created` | – | `Paginated<Application>`; `q` searches candidate name/email, `sort=score` puts highest match first (unscreened last). Each item carries `screening_summary` (score, required skills matched, screening questions met, knockout, flag count) or `null` |
| POST | `/applications` | `{candidate_id, job_id}` | `Application` (201, 409 if duplicate) |
| GET | `/applications/{id}` | – | `Application` |
| PATCH | `/applications/{id}` | `{stage?, note?}` | `Application` (stage changes on a decided application → 409 `already_decided`) |
| DELETE | `/applications/{id}` | – | 204 — permanently deletes one application with its documents/CV files, screenings, reviews, stage history, interviews and email logs. If it was the candidate's last application the candidate is deleted too. Audit `application.deleted` `{candidate_id, job_id, candidate_deleted, applications, documents, interview_sessions}` |
| POST | `/applications/{id}/decision` | `{decision: "accepted"\|"rejected", note?: string ≤ 2000}` | `Application` — final HR hiring decision after the AI interview. Requires stage `interview` and ≥ 1 completed interview session (else 409 `interview_not_completed`); 409 `already_decided` if already set (final). `accepted` → stage `hired`, `rejected` → stage `rejected`; stage history note `HR decision: Accepted/Rejected[ — note]`; audit `application.decision`; pending (not started) invitations are revoked; new invitations → 409 `already_decided` |

`Application` also carries `decision` (`"accepted"`/`"rejected"`/null), `decision_note`, `decided_at`, `decided_by` (name) and `has_completed_interview`.

## Documents & screening
| POST | `/applications/{id}/documents` | multipart `file` (PDF/DOCX ≤ 10 MB) | `DocumentInfo` (202). Same file content for the same application returns the existing document (200) |
| GET | `/documents/{id}/status` | – | `DocumentInfo` (poll every ~1.5 s while `queued`/`processing`) |
| GET | `/documents/{id}` | – | `DocumentDetail` (extraction, clean text, sections, methods) |
| POST | `/documents/{id}/reprocess` | – | `DocumentInfo` (202) |
| POST | `/applications/{id}/screening` | `{force?: boolean}` | `ScreeningResult` (201) or 202 `{status: "pending_document", document: DocumentInfo}` if CV still processing; 409 if no processed CV |
| GET | `/applications/{id}/screening` | – | latest `ScreeningResult` (404 if none) |
| GET | `/screenings?job_id=&min_score=&max_score=&reviewed=true|false` | – | `Paginated<ScreeningResult & {candidate_id, candidate_name, job_id, job_title, stage}>` |
| POST | `/applications/{id}/reviews` | `HRReviewInput` | `HRReview` (201) |
| GET | `/applications/{id}/reviews` | – | `HRReview[]` |

Screening runs automatically once a CV finishes processing, so normally the UI only polls the document status and then GETs the screening.

## Interview configuration
| GET | `/interview-templates?job_id=` | – | `InterviewTemplate[]` (`language`: "id"/"en", `cv_questions`: 0–5 personalised questions generated per candidate from their CV, asked first) |
| POST | `/interview-templates/suggest` | `{job_id}` | `InterviewTemplateInput` (not saved; LLM or built-in competency library) |
| POST | `/interview-templates` | `InterviewTemplateInput` | `InterviewTemplate` (201, status `draft`) |
| GET | `/interview-templates/{id}` | – | `InterviewTemplate` |
| PATCH | `/interview-templates/{id}` | partial input | `InterviewTemplate` (editing an approved template moves it back to `draft`) |
| POST | `/interview-templates/{id}/approve` | – | `InterviewTemplate` |

### Interview style (`InterviewTemplate.mode`)
- `"template"` (default) — fixed questions: `cv_questions` CV questions, then the first `num_questions` template questions in order (1..len(questions)), 5–180 min, `follow_up_rules` per question.
- `"conversational"` — a short, human-like interview led by the AI (one LLM call per interviewer turn, JSON `{kind, competency, text}`, `max_tokens` 600 with `reasoning_effort: "low"` (reasoning models), temperature 0.5, ~600–1,100 input tokens per turn): (1) greeting + "please introduce yourself", (2..n-1) one question per highest-weight competency (weight order) with a short transition referring to the last answer and personalised from a rule-based CV summary built once per session, (n) "any questions about this position?", then a closing message (answers only from job title/description/location/employment type, otherwise "HR will follow up") and the session completes. `num_questions` 3–5 (default 5, includes the introduction; with 4–5 the last one is "any questions?", with 3 it is intro + 2 core questions and then the closing), `duration_minutes` 5–10 (default 7); in the last minute it jumps to the final question. At most ONE follow-up in the whole interview (only for a very short/vague core answer). `questions` are optional guidance and the fallback pool; `cv_questions` and `follow_up_rules` are ignored. Competencies + rubrics stay mandatory (evaluation per competency is unchanged; every interviewer turn records its competency). Guardrails: outputs with more than one question, over 480 chars, protected topics (age, religion, ethnicity, marital status, pregnancy/children, health, politics, salary history — ID + EN keyword filter) or promises/scores are rejected; on rejection, LLM error or a `CONVERSATION_LLM_TIMEOUT_SECONDS` (12 s) timeout the scripted text for that slot is used so the interview never stalls.
- The mode is frozen on the session at invitation time (`InterviewSession.mode`); editing a template never changes interviews already created.

## Shortlist & bulk invitations (HR)
| POST | `/jobs/{id}/shortlist` | `ShortlistInput` — either `application_ids` or `top_n` (+ optional `min_score`) | `Paginated<Application>` of the applications moved to `shortlisted` (only from `applied`/`screening`; recorded in stage history) |
| POST | `/jobs/{id}/interviews/bulk-invite` | `BulkInviteInput` | `BulkInviteResponse` — per candidate `invited` (with `invitation_url` shown once, `email_status`) or `skipped` (`reason`: active invitation exists, wrong job, rejected…). Template must be approved and belong to the job |
| GET | `/email-logs?session_id=` | – | `EmailLogEntry[]` (bodies stored with tokens redacted) |

Email is sent over SMTP when `SMTP_HOST`/`MAIL_FROM` are configured; otherwise `email_status` is `not_configured` and HR shares the returned link manually.

## Interview sessions (HR)
| GET | `/interviews?status=&job_id=` | – | `Paginated<InterviewSession>` (messages omitted: `[]`). Each session carries `application_stage`, `application_decision` and `application_has_completed_interview` |
| POST | `/applications/{id}/interviews` | `{template_id, send_email?}` (template must be approved; `send_email` default true) | `InterviewInvitation` (201) — raw token shown once; `email` = email attempt |
| GET | `/interviews/{id}` | – | `InterviewSession` (with transcript; `mode`: "template"/"conversational"; each message has `mode_used`: "llm"/"fallback" for conversational interviewer turns, else null; in conversational mode `questions` are the planned slots `c1..cN`, the final slot's `competency` is null) |
| POST | `/interviews/{id}/revoke` | – | `InterviewSession` |
| POST | `/interviews/{id}/complete` | – | `InterviewSession` (HR force-complete; triggers evaluation) |
| GET | `/interviews/{id}/evaluation` | – | `InterviewEvaluation` (404 if none yet) |
| POST | `/interviews/{id}/evaluation` | – | `InterviewEvaluation` (202, re-run) |
| PATCH | `/interviews/{id}/evaluation` | `{reviewer_notes}` | `InterviewEvaluation` |

## Candidate interview (public; header `X-Interview-Token: <token>`, never in URL path/query)
The invitation link is `/interview#<token>`; the frontend reads the token from the URL fragment.
| GET | `/candidate-interview` | – | `CandidateInterviewState` |
| POST | `/candidate-interview/start` | `{consent: true}` | `CandidateInterviewState` |
| POST | `/candidate-interview/messages` | `{content, input_mode?: "voice"\|"text"}` (1–4000 chars) | `CandidateInterviewState` (next question / follow-up in `current_question`) |
| POST | `/candidate-interview/complete` | – | `CandidateInterviewState` |
| GET | `/candidate-interview/messages/{message_id}/audio` | – | `audio/wav` (interviewer message read aloud; `Cache-Control: private, max-age=3600`) |
| GET | `/candidate-interview/acknowledgements/{n}/audio` | – | `audio/wav` — conversational mode: the n-th (0-based) line of `acknowledgements`, played right after an answer is submitted while the next turn is generated (pre-generated at invitation time, cached forever on disk; 404 out of range or template mode) |
Errors: 401 `invalid_token`, 410 `expired` / `revoked`, 409 `completed`.
Audio: 404 `not_found` (unknown message, another session's message, or a candidate message), 409 `not_active` (not started, or completed more than 30 minutes ago), 503 `tts_unavailable` (server TTS disabled or the provider failed, e.g. rate limit; `details.reason`) → the client falls back to browser speech synthesis.
`CandidateInterviewState.voice = {server_tts: bool}` tells the client whether to request server audio.
`CandidateInterviewState.mode` is "template" or "conversational"; `acknowledgements: string[]` (conversational only, empty otherwise) are short lines like "Baik, terima kasih atas jawabannya." that are never added to the transcript. In conversational mode the response to the final answer has `status: "completed"` and its last message is the closing, whose audio stays available for 30 minutes.

## Analytics & system
| GET | `/analytics/dashboard` | – | `Dashboard` |
| GET | `/system/status` | – | `SystemStatus` |
| GET | `/health` (public) | – | `{status: "ok"}` |

`Dashboard` (one call for the home page):
- `has_data`, `has_demo_data`
- `kpis`: `open_jobs`, `total_jobs`, `applicants`, `applicants_this_week` (last 7 days), `interviews_completed` (applications with a completed AI interview), `waiting_for_decision` (completed interview, no HR decision, not hired/rejected/withdrawn), `hired` (stage `hired`), `decided` (decision set or stage hired/rejected), `hire_rate` (hired / decided × 100, 1 decimal; `null` when nothing is decided)
- `jobs` (max 6; open first by soonest `closes_on`, then drafts, then closed): `{job_id, title, status, closes_on, auto_invite_on, applicants, avg_match_score, interviewed, hired}`; `auto_invite_on` = `closes_on` + 1 day while auto-invite is enabled and has not run
- `attention` (max 5): `{kind: "decision", session_id, application_id, candidate_name, job_title, interview_score, completed_at}` (oldest first) and `{kind: "job_closing", job_id, job_title, closes_on, days_left, applicants}` for open jobs closing within 3 days (up to 2 slots reserved)
- `monthly`: 12 × `{month: "YYYY-MM", applicants, jobs_opened, interviews_completed, hired}`, oldest first, months without activity are 0. Bucketed in SQL by calendar month in the organisation timezone (`TIMEZONE`, default Asia/Jakarta/WIB): applicants by `created_at`; jobs opened by `opens_on` (else `created_at`), excluding drafts and future opening dates; completed AI interview sessions by `completed_at`; hires by `decided_at` where `decision = accepted`.

## Settings
| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/settings/scoring-weights` | – | `ScoringWeightSettings` |
| PUT | `/settings/scoring-weights` | `{weights}` | `ScoringWeightSettings` |
| GET | `/settings/data-retention` | – | `DataRetentionSettings` |
| PUT | `/settings/data-retention` | `Partial<{enabled, months_after_close, keep_hired}>` | `DataRetentionSettings` |
| POST | `/settings/data-retention/run` | – | `DataRetentionRunResult`; `409 retention_disabled` when off |

### Data retention (`ti_settings` key `data_retention`)
- Rules: `enabled` (default `false`), `months_after_close` (1–36, default 12), `keep_hired` (default `true`). Nothing is ever deleted while `enabled` is false.
- An application is **eligible** when its job's close date is more than N months ago (strictly before *today − N months*, organisation timezone). Close date = `closes_on`; for a `closed` job the earlier of `closes_on` and the job's last update, or the last update when there is no `closes_on`. Open jobs without a deadline never expire. Hired applications are skipped when `keep_hired`; applications with an AI interview `in_progress` (not expired) are always skipped.
- Deletion uses the same cascade as `DELETE /applications/{id}` (`services/deletion.py`): documents + stored files, screenings, reviews, stage history, interview sessions/messages/evaluations, email logs. A candidate is deleted once no applications remain.
- `preview = {eligible_applications, eligible_candidates, next_run_at}`; `eligible_candidates` counts candidates that would be removed completely. `next_run_at` is `null` when retention or the scheduler is off.
- The in-process scheduler runs it once per day at `RETENTION_HOUR` (default 02:00 WIB). The day is claimed atomically in `ti_settings` (`data_retention_state`), so several API processes never run it twice; the day is claimed even while retention is off, so switching it on waits for the next scheduled run.
- Audit: `settings.data_retention_updated` (before/after rules) and `data_retention.run` with counts only (`{trigger, months_after_close, keep_hired, applications, candidates, documents, interview_sessions}`) — no personal data.

## Security headers (every response)
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`, `Server: XORCA`.
- `/api/*`: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` and `Cache-Control: no-store` (unless the endpoint sets its own, e.g. interviewer audio: `private, max-age=3600`).
- Swagger UI (`/api/v1/talent/docs`, `/swagger.json`, `/swaggerui/*`): a CSP that allows its own scripts/styles; no `no-store`.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` over HTTPS, or always when `HSTS_ENABLED`/`FORCE_HTTPS` is true (TLS terminated by a proxy).
