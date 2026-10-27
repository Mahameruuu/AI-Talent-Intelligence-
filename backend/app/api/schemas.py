"""Swagger/OpenAPI models (documentation of request/response shapes with dummy examples)."""

from flask_restx import fields

from . import api

Error = api.model("Error", {
    "error": fields.Nested(api.model("ErrorBody", {
        "code": fields.String(example="validation_error"),
        "message": fields.String(example="Invalid request body."),
        "details": fields.Raw(example=[{"field": "title", "message": "Field required"}]),
    })),
})


def page_of(name, model):
    return api.model(name, {
        "items": fields.List(fields.Nested(model)),
        "total": fields.Integer(example=1),
        "page": fields.Integer(example=1),
        "page_size": fields.Integer(example=20),
    })


# ---------------------------------------------------------------- jobs
Weights = api.model("ScoringWeights", {
    "required_skills": fields.Float(example=40), "preferred_skills": fields.Float(example=15),
    "experience": fields.Float(example=20), "education": fields.Float(example=10),
    "certifications": fields.Float(example=5), "semantic": fields.Float(example=10),
})
AutoInviteInput = api.model("AutoInviteInput", {
    "enabled": fields.Boolean(example=True, description="Send AI interview invitations automatically"),
    "top_n": fields.Integer(example=10, min=1, max=100, description="Invite the N best-matching screened applicants"),
    "min_score": fields.Float(example=60, min=0, max=100, description="Optional minimum match score (null = none)"),
    "timing": fields.String(enum=["next_morning", "on_close"], example="next_morning",
                            description="next_morning: 08:00 WIB the day after closes_on (default); "
                                        "on_close: right after applications close"),
})
AutoInviteSkipped = api.model("AutoInviteSkipped", {
    "knockout": fields.Integer(example=2), "below_min_score": fields.Integer(example=1),
    "not_screened": fields.Integer(example=0), "already_invited": fields.Integer(example=3),
    "beyond_top_n": fields.Integer(example=7),
})
AutoInvite = api.model("AutoInvite", {
    "enabled": fields.Boolean(example=True),
    "top_n": fields.Integer(example=10),
    "min_score": fields.Float(example=None),
    "timing": fields.String(enum=["next_morning", "on_close"], example="next_morning"),
    "send_at": fields.String(example="2026-10-31T08:00:00+07:00",
                             description="next_morning: closes_on + 1 day at AUTO_INVITE_HOUR (WIB); on_close: the "
                                         "closing moment (closes_at, or 00:00 the next day without closes_time); "
                                         "null without a deadline"),
    "status": fields.String(enum=["disabled", "no_deadline", "waiting_template", "scheduled", "sent", "failed"],
                            example="scheduled"),
    "template_id": fields.Integer(example=3), "template_name": fields.String(example="Data Scientist interview"),
    "ran_at": fields.String(example=None), "invited_count": fields.Integer(example=None),
    "skipped": fields.Nested(AutoInviteSkipped, allow_null=True),
    "error": fields.String(example=None),
})
JobInput = api.model("JobInput", {
    "title": fields.String(required=True, example="Data Scientist"),
    "department": fields.String(example="Data & AI"),
    "location": fields.String(example="Jakarta (Hybrid)"),
    "description": fields.String(required=True, example="Build and deploy machine learning models for demand forecasting..."),
    "required_skills": fields.List(fields.String, example=["Python", "SQL", "Machine Learning"]),
    "preferred_skills": fields.List(fields.String, example=["PyTorch", "Airflow"]),
    "min_experience_years": fields.Float(example=3),
    "employment_type": fields.String(enum=["full_time", "part_time", "contract", "internship", "freelance"],
                                     example="full_time"),
    "salary_min": fields.Integer(example=12000000, description="Monthly, IDR (optional)"),
    "salary_max": fields.Integer(example=18000000, description="Monthly, IDR (optional)"),
    "salary_visible": fields.Boolean(example=True, description="Show the salary range to applicants"),
    "opens_on": fields.Date(example="2026-11-01", description="First day applications are accepted"),
    "closes_on": fields.Date(example="2026-11-30", description="Deadline day (inclusive, until closes_time WIB)"),
    "opens_time": fields.String(example="09:00", pattern=r"^\d{2}:\d{2}$",
                                description="Opening time on opens_on, HH:MM WIB (null = 00:00)"),
    "closes_time": fields.String(example="17:00", pattern=r"^\d{2}:\d{2}$",
                                 description="Closing time on closes_on, HH:MM WIB; closed from this minute on "
                                             "(null = end of the day, 23:59)"),
    "education_level": fields.String(enum=["none", "high_school", "diploma", "bachelor", "master", "doctorate"], example="bachelor"),
    "education_field": fields.String(example="Statistics, Computer Science or related"),
    "required_certifications": fields.List(fields.String, example=[]),
    "status": fields.String(enum=["draft", "open", "closed"], example="open"),
    "weights": fields.Nested(Weights),
    "auto_invite": fields.Nested(AutoInviteInput),
})
Job = api.inherit("Job", JobInput, {
    "auto_invite": fields.Nested(AutoInvite),
    "id": fields.Integer(example=1),
    "opens_at": fields.String(example="2026-11-01T09:00:00+07:00",
                              description="opens_on + opens_time (WIB, ISO 8601); null without opens_on"),
    "closes_at": fields.String(example="2026-11-30T17:00:00+07:00",
                               description="closes_on + closes_time, or 23:59:59 without a time (WIB, ISO 8601); "
                                           "null without closes_on"),
    "application_window": fields.String(enum=["upcoming", "open", "ended"], example="open",
                                        description="Null when the job has no period"),
    "days_left": fields.Integer(example=12, description="Calendar days until the closing day (0 = closes today); null once closed"),
    "is_demo": fields.Boolean(example=False),
    "candidate_count": fields.Integer(example=12),
    "created_at": fields.DateTime(),
    "updated_at": fields.DateTime(),
})
JobPage = page_of("JobPage", Job)

# ---------------------------------------------------------------- documents
Evidence = api.model("Evidence", {
    "text": fields.String(example="- Developed credit scoring models using sklearn and Pandas."),
    "section": fields.String(example="experience"),
    "line": fields.Integer(example=17),
})
PipelineStep = api.model("PipelineStep", {
    "name": fields.String(example="skills"),
    "status": fields.String(enum=["ok", "skipped", "warning", "failed"], example="ok"),
    "duration_ms": fields.Integer(example=4),
    "detail": fields.String(example="24 normalized, 1 unrecognized"),
})
DocumentInfo = api.model("DocumentInfo", {
    "id": fields.Integer(example=7), "application_id": fields.Integer(example=3), "candidate_id": fields.Integer(example=3),
    "filename": fields.String(example="cv_candidate.pdf"),
    "mime_type": fields.String(example="application/pdf"), "size_bytes": fields.Integer(example=48211),
    "status": fields.String(enum=["queued", "processing", "completed", "failed"], example="completed"),
    "error_code": fields.String(example=None), "error_message": fields.String(example=None),
    "page_count": fields.Integer(example=2), "ocr_used": fields.Boolean(example=False),
    "pipeline_version": fields.String(example="ti-nlp-1.0.0"),
    "steps": fields.List(fields.Nested(PipelineStep)),
    "processing_ms": fields.Integer(example=84),
    "created_at": fields.DateTime(), "processed_at": fields.DateTime(),
})
DocumentDetail = api.inherit("DocumentDetail", DocumentInfo, {
    "extraction": fields.Raw(description="CVExtraction: fields with value/evidence/method/confidence; null value = Not found in CV",
                             example={"name": {"value": "Rina Wijaya", "evidence": [{"text": "RINA WIJAYA", "section": "header", "line": 1}],
                                               "method": "rule:header", "confidence": "medium"},
                                      "skills": [{"original": "sklearn", "normalized": "scikit-learn", "category": "ml_library",
                                                  "in_taxonomy": True, "method": "alias", "evidence": []}],
                                      "total_experience_months": 101}),
    "clean_text": fields.String(example="RINA WIJAYA\nData Scientist | Jakarta Selatan..."),
    "sections": fields.Raw(example=[{"name": "experience", "start_line": 9, "end_line": 22}]),
    "methods": fields.Raw(example={"ner": "rule-based", "skills": "taxonomy-v1", "embeddings": "tfidf-lexical", "llm": "disabled"}),
})

# ---------------------------------------------------------------- candidates & applications
AppBrief = api.model("ApplicationBrief", {
    "id": fields.Integer(example=3), "job_id": fields.Integer(example=1), "job_title": fields.String(example="Data Scientist"),
    "stage": fields.String(example="screening"), "match_score": fields.Float(example=78.4),
})
CandidateSummary = api.model("CandidateSummary", {
    "id": fields.Integer(example=3), "full_name": fields.String(example="Rina Wijaya"),
    "email": fields.String(example="rina.wijaya@example.com"), "phone": fields.String(example="+62 812-0000-0000"),
    "top_skills": fields.List(fields.String, example=["Python", "SQL", "scikit-learn"]),
    "latest_document_status": fields.String(example="completed"), "best_match_score": fields.Float(example=78.4),
    "applications": fields.List(fields.Nested(AppBrief)), "is_demo": fields.Boolean(example=True),
    "created_at": fields.DateTime(),
})
Candidate = api.inherit("Candidate", CandidateSummary, {
    "location": fields.String(example="Jakarta Selatan"),
    "skills": fields.Raw(example=[{"name": "Python", "source": "ai"}, {"name": "Storybook", "source": "hr"}]),
    "education": fields.Raw(), "experience": fields.Raw(),
    "total_experience_months": fields.Integer(example=101),
    "corrections": fields.Raw(example={"skills_add": ["Storybook"]}),
    "documents": fields.List(fields.Nested(DocumentInfo)),
})
CandidatePage = page_of("CandidatePage", CandidateSummary)
CandidateCreate = api.model("CandidateCreateInput", {
    "full_name": fields.String(required=True, example="Candidate Name"),
    "email": fields.String(example="candidate@example.com"), "phone": fields.String(example="+62 811 0000 0000"),
})
Corrections = api.model("CandidateProfileCorrections", {
    "full_name": fields.String(example="Rina W. Wijaya"), "email": fields.String(), "phone": fields.String(),
    "location": fields.String(), "skills_add": fields.List(fields.String, example=["Storybook"]),
    "skills_remove": fields.List(fields.String, example=["Budgeting"]),
    "total_experience_months": fields.Integer(example=96), "notes": fields.String(example="Verified dates by phone."),
})
StageHistory = api.model("StageHistoryEntry", {
    "from_stage": fields.String(example="applied"), "to_stage": fields.String(example="screening"),
    "changed_by": fields.String(example="system"), "note": fields.String(example="CV screened automatically."),
    "created_at": fields.DateTime(),
})
Application = api.model("Application", {
    "id": fields.Integer(example=3), "candidate_id": fields.Integer(example=3), "candidate_name": fields.String(example="Rina Wijaya"),
    "job_id": fields.Integer(example=1), "job_title": fields.String(example="Data Scientist"),
    "stage": fields.String(enum=["applied", "screening", "shortlisted", "interview", "offer", "hired", "rejected", "withdrawn"]),
    "match_score": fields.Float(example=78.4),
    "latest_document": fields.Nested(DocumentInfo, allow_null=True), "latest_screening_id": fields.Integer(example=5),
    "stage_history": fields.List(fields.Nested(StageHistory)),
    "source": fields.String(enum=["public_form", "hr_upload", "manual"], example="public_form"),
    "form_answers": fields.Raw(example=[{"field_id": "f_domicile", "label": "Current city of residence",
                                         "type": "short_text", "value": "Jakarta"}]),
    "submitted_at": fields.DateTime(),
    "decision": fields.String(enum=["accepted", "rejected"], description="Final HR decision; null until decided"),
    "decision_note": fields.String(), "decided_at": fields.DateTime(), "decided_by": fields.String(example="Rika Recruiter"),
    "is_demo": fields.Boolean(), "created_at": fields.DateTime(),
})
ApplicationPage = page_of("ApplicationPage", Application)
DecisionInput = api.model("ApplicationDecisionInput", {
    "decision": fields.String(required=True, enum=["accepted", "rejected"]),
    "note": fields.String(example="Strong interview; send offer.", description="Optional, max 2000 characters"),
})
ApplicationCreate = api.model("ApplicationCreateInput", {
    "candidate_id": fields.Integer(required=True, example=3), "job_id": fields.Integer(required=True, example=1),
})
ApplicationUpdate = api.model("ApplicationUpdateInput", {
    "stage": fields.String(example="shortlisted"), "note": fields.String(example="Strong ML background."),
})
UploadResponse = api.model("CandidateUploadResponse", {
    "candidate": fields.Nested(Candidate), "application": fields.Nested(Application), "document": fields.Nested(DocumentInfo),
})

# ---------------------------------------------------------------- screening
Requirement = api.model("RequirementResult", {
    "key": fields.String(example="required_skill:scikit-learn"),
    "category": fields.String(enum=["required_skill", "preferred_skill", "experience", "education", "certification"]),
    "requirement": fields.String(example="scikit-learn"),
    "status": fields.String(enum=["matched", "not_found", "needs_review"], example="matched"),
    "matched_by": fields.String(enum=["exact", "normalized", "related", "computed", "semantic"], example="normalized"),
    "candidate_value": fields.String(example="sklearn → scikit-learn"),
    "explanation": fields.String(example="CV mentions \"sklearn\", normalized to scikit-learn."),
    "evidence": fields.List(fields.Nested(Evidence)),
    "hr_validation": fields.String(enum=["confirmed", "rejected"], example=None),
})
Component = api.model("ComponentScore", {
    "component": fields.String(example="required_skills"), "score": fields.Float(example=83.3),
    "weight": fields.Float(example=40), "effective_weight": fields.Float(example=44.4),
    "explanation": fields.String(example="5 of 6 required skills matched."),
})
Flag = api.model("ScreeningFlag", {
    "code": fields.String(example="missing_required_skills"), "severity": fields.String(enum=["info", "warning"]),
    "message": fields.String(example="1 of 6 required skills not found in CV: Spark."),
})
Review = api.model("HRReview", {
    "id": fields.Integer(), "application_id": fields.Integer(), "screening_result_id": fields.Integer(),
    "reviewer_id": fields.Integer(), "reviewer_name": fields.String(example="Rani Recruiter"),
    "notes": fields.String(example="Experience verified."), "recommendation": fields.String(enum=["advance", "hold", "needs_more_info", "not_proceed"]),
    "evidence_validations": fields.Raw(example={"required_skill:python": "confirmed"}), "created_at": fields.DateTime(),
})
ReviewInput = api.model("HRReviewInput", {
    "notes": fields.String(example="Strong ML background; confirm Spark exposure in interview."),
    "recommendation": fields.String(enum=["advance", "hold", "needs_more_info", "not_proceed"], example="advance"),
    "evidence_validations": fields.Raw(example={"required_skill:python": "confirmed"}),
    "new_stage": fields.String(example="shortlisted"),
})
Screening = api.model("ScreeningResult", {
    "id": fields.Integer(example=5), "application_id": fields.Integer(example=3), "document_id": fields.Integer(example=7),
    "status": fields.String(enum=["completed", "failed"]),
    "overall_score": fields.Float(example=78.4, description="Match with job criteria (0-100), not a success probability"),
    "components": fields.List(fields.Nested(Component)), "requirements": fields.List(fields.Nested(Requirement)),
    "experience_summary": fields.String(example="About 8.4 years of dated work experience across 3 position(s)..."),
    "flags": fields.List(fields.Nested(Flag)), "pipeline_version": fields.String(example="ti-nlp-1.0.0"),
    "methods": fields.Raw(example={"embeddings": "tfidf-lexical", "llm": "disabled"}), "created_at": fields.DateTime(),
    "reviews": fields.List(fields.Nested(Review)),
})
ScreeningListItem = api.inherit("ScreeningListItem", Screening, {
    "candidate_id": fields.Integer(), "candidate_name": fields.String(), "job_id": fields.Integer(),
    "job_title": fields.String(), "stage": fields.String(),
})
ScreeningPage = page_of("ScreeningPage", ScreeningListItem)
ScreeningRun = api.model("ScreeningRunInput", {"force": fields.Boolean(example=False, description="Re-run even if an identical result exists")})

# ---------------------------------------------------------------- interviews
Rubric = api.model("RubricLevel", {"score": fields.Integer(example=4), "descriptor": fields.String(example="Specific example with measurable result.")})
Competency = api.model("Competency", {
    "name": fields.String(example="Problem Solving"), "description": fields.String(example="Breaks down problems..."),
    "weight": fields.Float(example=25), "rubric": fields.List(fields.Nested(Rubric)),
})
Question = api.model("InterviewQuestion", {
    "id": fields.String(example="q1"), "competency": fields.String(example="Problem Solving"),
    "text": fields.String(example="Tell me about a difficult problem you solved..."),
})
FollowUp = api.model("FollowUpRules", {"max_follow_ups_per_question": fields.Integer(example=1), "min_answer_words": fields.Integer(example=25)})
TemplateInput = api.model("InterviewTemplateInput", {
    "job_id": fields.Integer(required=True, example=1), "name": fields.String(example="Data Scientist — Initial Screening"),
    "language": fields.String(enum=["id", "en"], example="id"),
    "mode": fields.String(enum=["template", "conversational"], example="template", description=(
        "template = ask the configured questions in order (num_questions 1..len(questions), 5–180 min, CV questions, "
        "follow-up rules). conversational = short human-like interview led by the AI: greeting + self-introduction, "
        "one question per top-weighted competency, 'any questions?', closing; num_questions 4–5 (incl. introduction "
        "and the final question), duration 5–10 min, at most one follow-up, questions optional (guidance/fallback), "
        "cv_questions and follow_up_rules ignored.")),
    "cv_questions": fields.Integer(example=2, description="Template mode only: personalised CV questions (0–5)"),
    "competencies": fields.List(fields.Nested(Competency)), "questions": fields.List(fields.Nested(Question)),
    "num_questions": fields.Integer(example=5), "duration_minutes": fields.Integer(example=30),
    "follow_up_rules": fields.Nested(FollowUp), "invitation_expiry_hours": fields.Integer(example=72),
})
Template = api.inherit("InterviewTemplate", TemplateInput, {
    "id": fields.Integer(), "job_title": fields.String(), "status": fields.String(enum=["draft", "approved"]),
    "approved_by": fields.String(), "created_at": fields.DateTime(), "updated_at": fields.DateTime(),
})
Message = api.model("InterviewMessage", {
    "id": fields.Integer(), "role": fields.String(enum=["assistant", "candidate"]), "content": fields.String(),
    "question_id": fields.String(), "competency": fields.String(), "is_follow_up": fields.Boolean(),
    "input_mode": fields.String(enum=["voice", "text"]),
    "mode_used": fields.String(enum=["llm", "fallback"], description=(
        "Conversational interviewer turns: generated by the LLM, or the scripted fallback (LLM unavailable/invalid)")),
    "created_at": fields.DateTime(),
})
Session = api.model("InterviewSession", {
    "id": fields.Integer(), "application_id": fields.Integer(), "candidate_name": fields.String(), "job_title": fields.String(),
    "template_id": fields.Integer(), "template_name": fields.String(),
    "mode": fields.String(enum=["template", "conversational"], description="Interview style frozen at invitation time"),
    "status": fields.String(enum=["pending", "in_progress", "completed", "expired", "revoked"]),
    "expires_at": fields.DateTime(), "started_at": fields.DateTime(), "completed_at": fields.DateTime(),
    "questions_total": fields.Integer(example=5), "questions_answered": fields.Integer(example=2),
    "messages": fields.List(fields.Nested(Message)), "evaluation_status": fields.String(),
    "application_stage": fields.String(example="interview"),
    "application_decision": fields.String(enum=["accepted", "rejected"]),
    "application_has_completed_interview": fields.Boolean(), "created_at": fields.DateTime(),
})
SessionPage = page_of("InterviewSessionPage", Session)
Invitation = api.model("InterviewInvitation", {
    "session": fields.Nested(Session),
    "invitation_url": fields.String(example="http://localhost:5173/interview#<token shown once>"),
    "expires_at": fields.DateTime(),
})
InvitationInput = api.model("InterviewInvitationInput", {
    "template_id": fields.Integer(required=True, example=1),
    "send_email": fields.Boolean(example=True, description="Email the invitation link to the candidate"),
})
CompetencyEval = api.model("CompetencyEvaluation", {
    "competency": fields.String(example="Problem Solving"), "score": fields.Integer(example=4),
    "rubric_level": fields.String(example="Specific example showing structured analysis..."),
    "evidence": fields.Raw(example=[{"quote": "I traced the bottleneck to a missing index...", "message_id": 12}]),
    "strengths": fields.List(fields.String), "gaps": fields.List(fields.String),
    "insufficient_evidence": fields.Boolean(example=False),
})
Evaluation = api.model("InterviewEvaluation", {
    "id": fields.Integer(), "session_id": fields.Integer(),
    "status": fields.String(enum=["pending", "processing", "completed", "needs_review", "failed"]),
    "method": fields.String(example="rule-based-evidence-only"), "overall_score": fields.Float(example=None),
    "overall_summary": fields.String(), "competencies": fields.List(fields.Nested(CompetencyEval)),
    "unanswered_areas": fields.List(fields.String), "error_message": fields.String(),
    "reviewer_notes": fields.String(), "reviewed_by": fields.String(), "reviewed_at": fields.DateTime(), "created_at": fields.DateTime(),
})
EvaluationNotes = api.model("EvaluationNotesInput", {"reviewer_notes": fields.String(required=True, example="Agree with scores; probe teamwork further.")})
CandidateState = api.model("CandidateInterviewState", {
    "status": fields.String(), "candidate_first_name": fields.String(example="Rina"), "job_title": fields.String(),
    "mode": fields.String(enum=["template", "conversational"]),
    "acknowledgements": fields.List(fields.String, example=["Baik, terima kasih atas jawabannya."], description=(
        "Conversational mode: short lines the room plays right after an answer is submitted (audio: "
        "GET /candidate-interview/acknowledgements/{n}/audio). Not part of the transcript. Empty in template mode.")),
    "company_name": fields.String(example="XORCA"), "instructions": fields.List(fields.String), "privacy_notice": fields.String(),
    "duration_minutes": fields.Integer(), "questions_total": fields.Integer(), "questions_answered": fields.Integer(),
    "consent_given": fields.Boolean(), "expires_at": fields.DateTime(),
    "voice": fields.Raw(example={"server_tts": True},
                        description="server_tts: interviewer audio is available from GET /candidate-interview/messages/{id}/audio"),
    "messages": fields.Raw(example=[{"id": 1, "role": "assistant", "content": "Hello...", "created_at": "2026-10-22T08:00:00Z"}]),
})
StartInput = api.model("CandidateInterviewStartInput", {"consent": fields.Boolean(required=True, example=True)})
MessageInput = api.model("CandidateInterviewMessageInput", {
    "content": fields.String(required=True, example="Di pekerjaan terakhir saya ..."),
    "input_mode": fields.String(enum=["voice", "text"], example="voice", description="How the answer was given"),
})
