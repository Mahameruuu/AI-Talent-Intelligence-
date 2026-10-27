// API contract between the React frontend and the Flask backend (/api/v1/talent).
// Field names mirror the JSON returned by the backend (snake_case).

export type ISODateString = string;

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

// ---------- Jobs ----------

export type JobStatus = "draft" | "open" | "closed";
export type EducationLevel =
  | "none"
  | "high_school"
  | "diploma"
  | "bachelor"
  | "master"
  | "doctorate";

export interface ScoringWeights {
  required_skills: number;
  preferred_skills: number;
  experience: number;
  education: number;
  certifications: number;
  semantic: number;
  /** Application-form screening questions answered as expected. */
  screening_questions: number;
}

export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "freelance";

export type AutoInviteStatus = "disabled" | "no_deadline" | "waiting_template" | "scheduled" | "sent" | "failed";

/** Why applicants were left out of the last automatic invitation run. */
export interface AutoInviteSkipped {
  knockout: number;
  below_min_score: number;
  not_screened: number;
  already_invited: number;
  beyond_top_n: number;
}

/**
 * When automatic invitations go out: `next_morning` = 08:00 WIB the day after applications close (default);
 * `on_close` = right after the closing moment (closes_on + closes_time).
 */
export type AutoInviteTiming = "next_morning" | "on_close";

/**
 * Automatic AI-interview invitations: sent after applications close (see `timing`)
 * to the top N screened applicants, using the job's approved interview template.
 */
export interface AutoInvite {
  enabled: boolean;
  /** 1..100 */
  top_n: number;
  /** 0..100; null = no minimum. */
  min_score: number | null;
  timing: AutoInviteTiming;
  /**
   * next_morning: closes_on + 1 day at 08:00 WIB; on_close: the closing moment (00:00 the next day without
   * closes_time). ISO with +07:00; null without a deadline.
   */
  send_at: ISODateString | null;
  status: AutoInviteStatus;
  template_id: number | null;
  template_name: string | null;
  ran_at: ISODateString | null;
  invited_count: number | null;
  skipped: AutoInviteSkipped | null;
  error: string | null;
}

/** Settings HR can change when creating or editing a job. */
export interface AutoInviteInput {
  enabled?: boolean;
  top_n?: number;
  min_score?: number | null;
  timing?: AutoInviteTiming;
}

export interface Job {
  id: number;
  title: string;
  department: string | null;
  location: string | null;
  description: string;
  required_skills: string[];
  preferred_skills: string[];
  min_experience_years: number | null;
  education_level: EducationLevel | null;
  education_field: string | null;
  required_certifications: string[];
  status: JobStatus;
  employment_type: EmploymentType;
  /** Monthly salary range in IDR (optional). */
  salary_min: number | null;
  salary_max: number | null;
  /** Show the salary range to applicants on the public application page. */
  salary_visible: boolean;
  /** Application period (organisation timezone, WIB). "YYYY-MM-DD"; null = no limit. */
  opens_on: string | null;
  closes_on: string | null; // deadline day
  /** "HH:MM" WIB. Opens at opens_on opens_time (00:00 when null). */
  opens_time: string | null;
  /** "HH:MM" WIB. Closed from this minute on closes_on; null = open the whole closing day (until 23:59). */
  closes_time: string | null;
  /** Computed opening / closing moments (ISO, +07:00); closes_at is …T23:59:59 without a time; null without a date. */
  opens_at: ISODateString | null;
  closes_at: ISODateString | null;
  /** Computed by the server from the current time. Null when the job has no period. */
  application_window: "upcoming" | "open" | "ended" | null;
  /** Calendar days until the closing day (0 = closes today); null without a deadline or once closed. */
  days_left: number | null;
  weights: ScoringWeights;
  auto_invite: AutoInvite;
  is_demo: boolean;
  candidate_count: number;
  created_at: ISODateString;
  updated_at: ISODateString;
}

/** Job fields HR sends; salary_visible/employment_type have server defaults. */
export type JobInput = Omit<
  Job,
  | "id"
  | "is_demo"
  | "candidate_count"
  | "created_at"
  | "updated_at"
  | "weights"
  | "application_window"
  | "days_left"
  | "opens_at"
  | "closes_at"
  | "auto_invite"
> & { weights?: Partial<ScoringWeights>; auto_invite?: AutoInviteInput };

// ---------- Candidates & applications ----------

export type ApplicationStage =
  | "applied"
  | "screening"
  | "shortlisted"
  | "interview"
  | "offer"
  | "hired"
  | "rejected"
  | "withdrawn";

export type DocumentStatus =
  | "queued"
  | "processing"
  | "completed"
  | "failed";

/** A value extracted from the CV with the text that supports it. */
export interface Evidence {
  text: string; // verbatim excerpt from the CV text
  section: string | null; // detected section, e.g. "experience"
  line: number | null; // 1-based line index in the cleaned text
}

export interface ExtractedField<T = string> {
  value: T | null; // null => "Not found in CV"
  evidence: Evidence[];
  method: string; // e.g. "regex", "rule:header", "llm-verified"
  confidence: "high" | "medium" | "low";
}

export interface ExtractedSkill {
  original: string; // as written in CV, e.g. "sklearn"
  normalized: string; // canonical, e.g. "scikit-learn"
  category: string | null; // e.g. "ml_library"
  in_taxonomy: boolean; // false => unrecognized term, needs review
  method: "dictionary" | "alias" | "section-list" | "llm-verified";
  evidence: Evidence[];
}

export interface ExperienceEntry {
  title: string | null;
  company: string | null;
  start: string | null; // "YYYY-MM" or "YYYY"
  end: string | null; // "YYYY-MM", "YYYY" or "present"
  is_current: boolean;
  duration_months: number | null;
  description: string | null;
  evidence: Evidence[];
}

export interface EducationEntry {
  level: EducationLevel | null;
  degree: string | null;
  field: string | null;
  institution: string | null;
  start_year: number | null;
  end_year: number | null;
  gpa: string | null;
  evidence: Evidence[];
}

export interface CVExtraction {
  name: ExtractedField;
  email: ExtractedField;
  phone: ExtractedField;
  location: ExtractedField;
  summary: ExtractedField;
  skills: ExtractedSkill[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: ExtractedField[];
  languages: ExtractedField[];
  total_experience_months: number | null; // null if dates insufficient
  experience_calculation_note: string;
  sections_detected: string[];
}

export interface PipelineStep {
  name: string; // "validate", "extract_text", "ocr", "preprocess", "sections", "entities", "skills", "experience", "education", "llm_extraction", "persist"
  status: "ok" | "skipped" | "warning" | "failed";
  duration_ms: number;
  detail: string | null;
}

export interface DocumentInfo {
  id: number;
  application_id: number;
  candidate_id: number;
  filename: string;
  mime_type: string;
  size_bytes: number;
  status: DocumentStatus;
  error_code: string | null;
  error_message: string | null;
  page_count: number | null;
  ocr_used: boolean;
  pipeline_version: string;
  steps: PipelineStep[];
  processing_ms: number | null;
  created_at: ISODateString;
  processed_at: ISODateString | null;
}

export interface DocumentDetail extends DocumentInfo {
  extraction: CVExtraction | null;
  clean_text: string | null; // shown in the evidence viewer
  sections: { name: string; start_line: number; end_line: number }[];
  methods: {
    ner: string; // e.g. "rule-based"
    skills: string; // e.g. "taxonomy-v1 (412 skills)"
    embeddings: string; // e.g. "tfidf-lexical" or model name
    llm: string; // e.g. "disabled" | "claude-opus-5-5" | "failed: timeout"
  };
}

export interface CandidateProfileCorrections {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  skills_add?: string[];
  skills_remove?: string[];
  total_experience_months?: number | null;
  notes?: string | null;
}

export interface CandidateSummary {
  id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  top_skills: string[];
  latest_document_status: DocumentStatus | null;
  best_match_score: number | null;
  applications: {
    id: number;
    job_id: number;
    job_title: string;
    stage: ApplicationStage;
    match_score: number | null;
  }[];
  is_demo: boolean;
  created_at: ISODateString;
}

export interface Candidate extends CandidateSummary {
  location: string | null;
  // Effective profile = AI extraction + HR corrections applied
  skills: { name: string; source: "ai" | "hr" }[];
  education: EducationEntry[];
  experience: ExperienceEntry[];
  total_experience_months: number | null;
  corrections: CandidateProfileCorrections; // HR corrections (stored separately)
  documents: DocumentInfo[];
}

export interface StageHistoryEntry {
  from_stage: ApplicationStage | null;
  to_stage: ApplicationStage;
  changed_by: string | null;
  note: string | null;
  created_at: ISODateString;
}

export interface Application {
  id: number;
  candidate_id: number;
  candidate_name: string;
  candidate_email: string | null;
  job_id: number;
  job_title: string;
  stage: ApplicationStage;
  match_score: number | null;
  latest_document: DocumentInfo | null;
  latest_screening_id: number | null;
  /** Compact outcome of the latest screening (null until the CV has been screened). */
  screening_summary: ScreeningSummary | null;
  stage_history: StageHistoryEntry[];
  /** How the application arrived. */
  source: ApplicationSource;
  /** Answers to the job's custom form fields (empty unless source = "public_form"). */
  form_answers: FormAnswer[];
  submitted_at: ISODateString | null;
  /** Final HR hiring decision after the AI interview (null until decided; can't be changed). */
  decision: HiringDecision | null;
  decision_note: string | null;
  decided_at: ISODateString | null;
  /** Name of the HR user who decided. */
  decided_by: string | null;
  /** True when at least one AI interview for this application is completed. */
  has_completed_interview: boolean;
  is_demo: boolean;
  created_at: ISODateString;
}

export type HiringDecision = "accepted" | "rejected";

export interface ApplicationDecisionInput {
  decision: HiringDecision;
  note?: string;
}

// ---------- Screening ----------

export interface ScreeningSummary {
  overall_score: number | null;
  required_matched: number;
  required_total: number;
  needs_review: number;
  screening_met: number; // application-form screening questions answered as expected
  screening_total: number;
  knockout_failed: boolean; // a must-meet screening question was not met (flag only)
  flags: number;
}

export type RequirementStatus = "matched" | "not_found" | "needs_review";
export type RequirementCategory =
  | "required_skill"
  | "preferred_skill"
  | "experience"
  | "education"
  | "certification"
  | "screening_question";

export interface RequirementResult {
  key: string; // stable id, e.g. "required_skill:python"
  category: RequirementCategory;
  requirement: string; // e.g. "Python" or "Min. 3 years experience"
  status: RequirementStatus;
  matched_by: "exact" | "normalized" | "related" | "computed" | "semantic" | null;
  candidate_value: string | null; // e.g. "sklearn -> scikit-learn" or "4.5 years"
  explanation: string;
  evidence: Evidence[];
  hr_validation: "confirmed" | "rejected" | null; // from HR review
  /** Screening questions only: must-meet qualification (unmet => flagged, never auto-rejected). */
  knockout?: boolean;
}

export interface ComponentScore {
  component: keyof ScoringWeights;
  score: number | null; // 0..100, null if not computable (excluded from overall)
  weight: number; // configured weight (0..100)
  effective_weight: number; // after renormalising excluded components
  explanation: string;
}

export interface ScreeningResult {
  id: number;
  application_id: number;
  document_id: number;
  status: "completed" | "failed";
  overall_score: number | null; // 0..100: match with job criteria, NOT success probability
  components: ComponentScore[];
  requirements: RequirementResult[];
  experience_summary: string;
  flags: { code: string; severity: "info" | "warning"; message: string }[];
  pipeline_version: string;
  methods: Record<string, string>;
  created_at: ISODateString;
  reviews: HRReview[];
}

export type Recommendation =
  | "advance"
  | "hold"
  | "needs_more_info"
  | "not_proceed";

export interface HRReview {
  id: number;
  application_id: number;
  screening_result_id: number | null;
  reviewer_id: number;
  reviewer_name: string;
  notes: string | null;
  recommendation: Recommendation | null;
  evidence_validations: Record<string, "confirmed" | "rejected">;
  created_at: ISODateString;
}

export interface HRReviewInput {
  notes?: string;
  recommendation?: Recommendation;
  evidence_validations?: Record<string, "confirmed" | "rejected">;
  new_stage?: ApplicationStage;
}

// ---------- Interviews ----------

export interface RubricLevel {
  score: number; // 1..5
  descriptor: string;
}

export interface Competency {
  name: string;
  description: string;
  weight: number;
  rubric: RubricLevel[];
}

export interface InterviewQuestion {
  id: string;
  competency: string;
  text: string;
}

export interface InterviewTemplate {
  id: number;
  job_id: number;
  job_title: string;
  name: string;
  /** Interview language: "id" = Bahasa Indonesia (default), "en" = English. */
  language: InterviewLanguage;
  /**
   * "template": the AI reads the template questions in order (default).
   * "conversational": short human-like interview (greeting → self-introduction → 2–3 core questions
   * → "any questions?" → closing). num_questions 3–5 (3 = intro + 2 core, no "any questions?"), duration 5–10 min, questions optional (fallback pool);
   * cv_questions and follow_up_rules are ignored.
   */
  mode: InterviewMode;
  /** Personalised questions generated from each candidate's CV, asked before the template questions (0-5). */
  cv_questions: number;
  competencies: Competency[];
  questions: InterviewQuestion[];
  num_questions: number;
  duration_minutes: number;
  follow_up_rules: {
    max_follow_ups_per_question: number;
    min_answer_words: number;
  };
  invitation_expiry_hours: number;
  status: "draft" | "approved";
  approved_by: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export type InterviewTemplateInput = Pick<
  InterviewTemplate,
  | "job_id"
  | "name"
  | "language"
  | "mode"
  | "cv_questions"
  | "competencies"
  | "questions"
  | "num_questions"
  | "duration_minutes"
  | "follow_up_rules"
  | "invitation_expiry_hours"
>;

export type InterviewLanguage = "id" | "en";

export type InterviewMode = "template" | "conversational";

/** Conversational mode: whether an interviewer turn came from the LLM or the scripted fallback. */
export type InterviewMessageModeUsed = "llm" | "fallback";

export type InterviewStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "expired"
  | "revoked";

export interface InterviewMessage {
  id: number;
  role: "assistant" | "candidate";
  content: string;
  question_id: string | null;
  competency: string | null;
  is_follow_up: boolean;
  /** Candidate answers only: "voice" (speech-to-text) or "text" (typed). */
  input_mode: "voice" | "text" | null;
  /** Interviewer messages of conversational sessions only; null otherwise. */
  mode_used: InterviewMessageModeUsed | null;
  created_at: ISODateString;
}

/** A question as asked in one specific session. */
export interface SessionQuestion {
  id: string; // "cv1", "cv2" for CV-based questions; "c1".."c5" planned slots in conversational mode; template ids otherwise
  /** CV questions use "Pendalaman Pengalaman CV"; null for the conversational "any questions?" slot. */
  competency: string | null;
  text: string;
  source: "cv" | "template";
  cv_basis: string | null; // CV line the question is based on
  cv_basis_line: number | null; // 1-based line in the document's clean_text
}

export type EmailStatus = "sent" | "failed" | "not_configured";

export interface EmailLogEntry {
  id: number;
  to_email: string;
  subject: string;
  status: EmailStatus;
  error: string | null;
  kind: string; // "interview_invitation"
  session_id: number | null;
  created_at: ISODateString;
}

export interface InterviewSession {
  id: number;
  application_id: number;
  candidate_name: string;
  job_title: string;
  template_id: number;
  template_name: string;
  status: InterviewStatus;
  expires_at: ISODateString;
  started_at: ISODateString | null;
  completed_at: ISODateString | null;
  language: InterviewLanguage;
  mode: InterviewMode;
  questions: SessionQuestion[];
  questions_total: number;
  questions_answered: number;
  /** Latest invitation email attempt for this session, if any. */
  invitation_email: EmailLogEntry | null;
  messages: InterviewMessage[];
  evaluation_status: InterviewEvaluation["status"] | null;
  /** Current stage of the session's application. */
  application_stage: ApplicationStage;
  /** Final HR decision on the session's application (null until decided). */
  application_decision: HiringDecision | null;
  /** True when any AI interview of the application is completed. */
  application_has_completed_interview: boolean;
  created_at: ISODateString;
}

/** Returned once on creation; the raw token is never retrievable again. */
export interface InterviewInvitation {
  session: InterviewSession;
  invitation_url: string; // e.g. http://localhost:5173/interview#<token>
  expires_at: ISODateString;
  /** Email attempt when send_email was true; null otherwise. */
  email: EmailLogEntry | null;
}

export interface ShortlistInput {
  application_ids?: number[];
  top_n?: number; // pick the N highest-scoring screened applications (stage applied/screening)
  min_score?: number;
  note?: string;
}

export interface BulkInviteInput {
  template_id: number;
  application_ids: number[];
  send_email?: boolean; // default true
}

export interface BulkInviteResult {
  application_id: number;
  candidate_name?: string;
  email?: string | null;
  status: "invited" | "skipped";
  reason?: string; // when skipped
  session_id?: number;
  invitation_url?: string; // shown once
  cv_questions?: number;
  email_status?: EmailStatus | "not_requested";
  email_error?: string | null;
}

export interface BulkInviteResponse {
  results: BulkInviteResult[];
  invited: number;
  emailed: number;
  smtp_configured: boolean;
}

export interface CompetencyEvaluation {
  competency: string;
  score: number | null; // 1..5 per rubric, null => insufficient evidence
  rubric_level: string | null; // descriptor of chosen level
  evidence: { quote: string; message_id: number | null }[];
  strengths: string[];
  gaps: string[];
  insufficient_evidence: boolean;
}

export interface InterviewEvaluation {
  id: number;
  session_id: number;
  status: "pending" | "processing" | "completed" | "needs_review" | "failed";
  method: string; // "llm:<model>" | "rule-based-evidence-only"
  overall_score: number | null; // 0..100 weighted, null if not computable
  overall_summary: string | null;
  competencies: CompetencyEvaluation[];
  unanswered_areas: string[];
  error_message: string | null;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: ISODateString | null;
  created_at: ISODateString;
}

/** Candidate-facing view (no internal evaluation data). */
export interface CandidateInterviewState {
  status: InterviewStatus;
  language: InterviewLanguage;
  mode: InterviewMode;
  /**
   * Conversational mode only (empty otherwise): short spoken acknowledgements played right after an
   * answer is submitted. Audio: GET /candidate-interview/acknowledgements/{index}/audio.
   */
  acknowledgements: string[];
  /** BCP-47 tag for speech synthesis/recognition, e.g. "id-ID". */
  speech_lang: string;
  interviewer_name: string; // e.g. "Pewawancara AI XORCA"
  candidate_name: string;
  candidate_first_name: string;
  job_title: string;
  company_name: string;
  instructions: string[];
  privacy_notice: string;
  duration_minutes: number;
  started_at: ISODateString | null;
  questions_total: number;
  questions_answered: number;
  /** What the interviewer is currently asking (null before start / after completion). */
  current_question: {
    index: number; // 1-based
    total: number;
    text: string; // full text of the latest interviewer message (read aloud)
    is_follow_up: boolean;
    message_id: number | null;
  } | null;
  consent_given: boolean;
  expires_at: ISODateString;
  /** server_tts: interviewer audio is available from GET /candidate-interview/messages/{id}/audio. */
  voice: { server_tts: boolean };
  messages: Pick<InterviewMessage, "id" | "role" | "content" | "created_at">[];
}

// ---------- Dashboard ----------

export interface DashboardKpis {
  open_jobs: number;
  total_jobs: number;
  /** All applications in scope. */
  applicants: number;
  /** Applications received in the last 7 days. */
  applicants_this_week: number;
  /** Applications with a completed AI interview. */
  interviews_completed: number;
  /** Completed AI interview, no HR decision yet. */
  waiting_for_decision: number;
  hired: number;
  /** Applications with a final outcome (hired or rejected). */
  decided: number;
  /** hired / decided × 100; null when nothing is decided yet. */
  hire_rate: number | null;
}

export interface DashboardMonth {
  /** "YYYY-MM" (WIB calendar month) */
  month: string;
  applicants: number;
  jobs_opened: number;
  interviews_completed: number;
  hired: number;
}

export interface DashboardJobRow {
  job_id: number;
  title: string;
  status: JobStatus;
  /** "YYYY-MM-DD" */
  closes_on: string | null;
  /** "HH:MM" WIB or null (open the whole closing day). */
  closes_time: string | null;
  /** ISO (+07:00); …T23:59:59 without a closing time. */
  closes_at: ISODateString | null;
  /** "YYYY-MM-DD": day the top candidates are invited to the AI interview (null when not scheduled). */
  auto_invite_on: string | null;
  /** ISO (+07:00): when the invitations are sent (the job's auto_invite.send_at); null when not scheduled. */
  auto_invite_at: ISODateString | null;
  applicants: number;
  avg_match_score: number | null;
  interviewed: number;
  hired: number;
}

export interface DashboardDecisionItem {
  kind: "decision";
  session_id: number;
  application_id: number;
  candidate_name: string;
  job_title: string;
  interview_score: number | null;
  completed_at: ISODateString | null;
}

export interface DashboardClosingJobItem {
  kind: "job_closing";
  job_id: number;
  job_title: string;
  /** "YYYY-MM-DD" */
  closes_on: string;
  /** "HH:MM" WIB or null (whole day). */
  closes_time: string | null;
  closes_at: ISODateString | null;
  days_left: number;
  applicants: number;
}

export type DashboardAttentionItem = DashboardDecisionItem | DashboardClosingJobItem;

/** GET /analytics/dashboard */
export interface DashboardData {
  has_data: boolean;
  has_demo_data: boolean;
  kpis: DashboardKpis;
  jobs: DashboardJobRow[];
  attention: DashboardAttentionItem[];
  /** Last 12 months, oldest first; months without activity are 0. */
  monthly: DashboardMonth[];
}

// ---------- System ----------

export interface SystemStatus {
  database: "ok" | "error";
  llm: { enabled: boolean; provider: string | null; model: string | null; detail: string };
  ocr: { available: boolean; detail: string };
  embeddings: { backend: string; detail: string };
  ner: { backend: string; detail: string };
  skill_taxonomy: { version: string; skills: number; aliases: number };
  worker: { max_workers: number; queued: number; running: number };
  recent_failures: {
    document_id: number;
    filename: string;
    error_code: string | null;
    error_message: string | null;
    at: ISODateString;
  }[];
  pipeline_version: string;
}

// ---------- Frontend additions ----------
// Request/response shapes that docs/api-endpoints.md describes inline but that had no
// named type above. Additive only: nothing above was renamed or removed.

export type JobUpdateInput = Partial<JobInput>;

export interface CandidateCreateInput {
  full_name: string;
  email?: string | null;
  phone?: string | null;
}

/** POST /candidates/upload (202) */
export interface CandidateUploadResponse {
  candidate: Candidate;
  application: Application;
  document: DocumentInfo;
}

export interface ApplicationCreateInput {
  candidate_id: number;
  job_id: number;
}

export interface ApplicationUpdateInput {
  stage?: ApplicationStage;
  note?: string;
}

export interface ScreeningRunInput {
  force?: boolean;
}

/** POST /applications/{id}/screening (202) while the CV is still processing. */
export interface ScreeningPendingResponse {
  status: "pending_document";
  document: DocumentInfo;
}

/** Row of GET /screenings */
export type ScreeningListItem = ScreeningResult & {
  candidate_id: number;
  candidate_name: string;
  job_id: number;
  job_title: string;
  stage: ApplicationStage;
};

export type InterviewTemplateUpdateInput = Partial<InterviewTemplateInput>;

export interface InterviewInvitationInput {
  template_id: number;
  send_email?: boolean; // default true
}

export interface EvaluationNotesInput {
  reviewer_notes: string;
}

export interface CandidateInterviewStartInput {
  consent: true;
}

export interface CandidateInterviewMessageInput {
  content: string;
  input_mode?: "voice" | "text";
}

export interface HealthResponse {
  status: "ok";
}

// ---------- Public application forms ----------

export type ApplicationSource = "public_form" | "hr_upload" | "manual";

export type FormFieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "date"
  | "url"
  | "select"
  | "multi_select"
  | "checkbox"
  | "yes_no";

export interface FormField {
  id: string; // stable id, used as the key in submitted answers
  label: string;
  type: FormFieldType;
  required: boolean;
  help_text: string | null;
  placeholder: string | null;
  options: string[]; // for select / multi_select (min 2)
  max_length: number | null; // for short_text / long_text
  /**
   * Screening rule (HR only; never sent to applicants). Allowed for yes_no, select, number and checkbox.
   * yes_no: expected · select: accepted (subset of options) · number: min and/or max · checkbox: must be checked.
   * knockout = must-meet qualification: unmet answers are flagged for HR, never auto-rejected.
   */
  screening?: FormScreeningRule | null;
}

export interface FormScreeningRule {
  enabled: true;
  knockout: boolean;
  expected?: "yes" | "no" | true; // yes_no ("yes"/"no"), checkbox (true)
  accepted?: string[]; // select
  min?: number; // number
  max?: number; // number
}

/** Always present and required on every form; not editable. type "file" is the CV upload. */
export interface BuiltInFormField {
  id: "full_name" | "email" | "phone" | "cv";
  label: string;
  type: "short_text" | "email" | "phone" | "file";
  required: true;
  built_in: true;
}

export type FormAnswerValue = string | number | boolean | string[] | null;

export interface FormAnswer {
  field_id: string;
  label: string; // label at submit time
  type: FormFieldType;
  value: FormAnswerValue;
}

export type ApplicationFormStatus = "draft" | "published" | "closed";

export type FormClosedReason = "draft" | "closed" | "job_draft" | "not_yet_open" | "deadline_passed";

export interface ApplicationForm {
  id: number;
  job_id: number;
  job_title: string;
  slug: string;
  public_url: string; // e.g. http://localhost:5173/apply/k3J9xQ2mP0aB
  title: string;
  intro: string | null;
  built_in_fields: BuiltInFormField[];
  fields: FormField[];
  status: ApplicationFormStatus;
  accepting_applications: boolean; // published, job open, within the job's application period
  closed_reason: FormClosedReason | null;
  /** The job's application period ("YYYY-MM-DD"), which is the deadline applicants see. */
  job_opens_on: string | null;
  job_closes_on: string | null;
  /** "HH:MM" WIB or null. */
  job_opens_time: string | null;
  job_closes_time: string | null;
  job_opens_at: ISODateString | null;
  job_closes_at: ISODateString | null;
  closes_at: ISODateString | null;
  published_at: ISODateString | null;
  submission_count: number;
  created_at: ISODateString;
  updated_at: ISODateString | null;
}

export interface ApplicationFormInput {
  title?: string;
  intro?: string | null;
  fields?: Array<Omit<FormField, "id"> & { id?: string }>; // omit id for new fields; server assigns
  closes_at?: ISODateString | null;
}

export interface PublicApplicationForm {
  slug: string;
  title: string;
  intro: string | null;
  company_name: string;
  job: {
    title: string;
    department: string | null;
    location: string | null;
    description: string;
    required_skills: string[];
    preferred_skills: string[];
    min_experience_years: number | null;
    opens_on: string | null;
    closes_on: string | null;
    /** "HH:MM" WIB; null = 00:00 (opens) / end of the day (closes). */
    opens_time: string | null;
    closes_time: string | null;
    opens_at: ISODateString | null;
    closes_at: ISODateString | null;
    employment_type: EmploymentType;
    /** Only present (non-null) when HR chose to show the salary. */
    salary_min: number | null;
    salary_max: number | null;
  };
  built_in_fields: BuiltInFormField[];
  fields: FormField[];
  accepting_applications: boolean;
  /** Why applications aren't accepted (null when they are). */
  closed_reason: FormClosedReason | null;
  closes_at: ISODateString | null;
  max_upload_mb: number;
  privacy_notice: string;
}

export interface ApplicationSubmitted {
  reference: string; // e.g. APP-000123
  message: string;
}

// ---------- Organisation settings: scoring weights ----------

/** One row of the weights table: only `weight` is editable by HR. */
export interface ScoringWeightRow {
  no: number;
  key: keyof ScoringWeights;
  label: string; // e.g. "Skill wajib"
  description: string;
  weight: number; // percentage 0..100
}

export interface ScoringWeightSettings {
  items: ScoringWeightRow[];
  total: number; // always 100 once saved
  is_default: boolean; // true until HR saves custom weights
  updated_at: ISODateString | null;
  updated_by: string | null;
  /** Applications of open jobs that are re-scored when the weights change. */
  affected_applications: number;
  /** PUT response only: number of applications queued for re-scoring. */
  rescreen_queued?: number;
}

export interface ScoringWeightsInput {
  weights: ScoringWeights; // must add up to 100
}

/** Settings → Data retention (`GET/PUT /settings/data-retention`). */
export interface DataRetentionRules {
  enabled: boolean;
  /** 1–36 */
  months_after_close: number;
  keep_hired: boolean;
}

export interface DataRetentionRunCounts {
  applications: number;
  candidates: number;
  documents: number;
  interview_sessions: number;
}

export interface DataRetentionSettings extends DataRetentionRules {
  is_default: boolean;
  updated_at: ISODateString | null;
  updated_by: string | null;
  last_run_at: ISODateString | null;
  last_run_result: DataRetentionRunCounts | null;
  preview: {
    eligible_applications: number;
    /** Candidates removed completely (no other applications left). */
    eligible_candidates: number;
    /** Next automatic run (local time); null when disabled. */
    next_run_at: ISODateString | null;
  };
}

export interface DataRetentionRunResult extends DataRetentionRunCounts {
  trigger: "manual" | "scheduled";
  months_after_close: number;
  keep_hired: boolean;
}
