// Runtime validation for critical responses. Each schema is typed against the contract in
// `@/types/api`, so TypeScript fails the build if the two drift apart.
import { z, type ZodType } from "zod";
import type {
  ApplicationSubmitted,
  BuiltInFormField,
  FormField,
  FormFieldType,
  PublicApplicationForm,
  CandidateInterviewState,
  DashboardData,
  InterviewStatus,
} from "@/types/api";

const interviewStatusSchema: ZodType<InterviewStatus> = z.enum([
  "pending",
  "in_progress",
  "completed",
  "expired",
  "revoked",
]);

const countSchema = z.number().nonnegative();

export const dashboardSchema: ZodType<DashboardData> = z.object({
  has_data: z.boolean(),
  has_demo_data: z.boolean(),
  kpis: z.object({
    open_jobs: countSchema,
    total_jobs: countSchema,
    applicants: countSchema,
    applicants_this_week: countSchema,
    interviews_completed: countSchema,
    waiting_for_decision: countSchema,
    hired: countSchema,
    decided: countSchema,
    hire_rate: z.number().nullable(),
  }),
  jobs: z.array(
    z.object({
      job_id: z.number(),
      title: z.string(),
      status: z.enum(["draft", "open", "closed"]),
      closes_on: z.string().nullable(),
      closes_time: z.string().nullable().default(null),
      closes_at: z.string().nullable().default(null),
      auto_invite_on: z.string().nullable(),
      auto_invite_at: z.string().nullable().default(null),
      applicants: countSchema,
      avg_match_score: z.number().nullable(),
      interviewed: countSchema,
      hired: countSchema,
    }),
  ),
  attention: z.array(
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("decision"),
        session_id: z.number(),
        application_id: z.number(),
        candidate_name: z.string(),
        job_title: z.string(),
        interview_score: z.number().nullable(),
        completed_at: z.string().nullable(),
      }),
      z.object({
        kind: z.literal("job_closing"),
        job_id: z.number(),
        job_title: z.string(),
        closes_on: z.string(),
        closes_time: z.string().nullable().default(null),
        closes_at: z.string().nullable().default(null),
        days_left: z.number(),
        applicants: countSchema,
      }),
    ]),
  ),
  monthly: z.array(
    z.object({
      month: z.string(),
      applicants: countSchema,
      jobs_opened: countSchema,
      interviews_completed: countSchema,
      hired: countSchema,
    }),
  ),
});

const candidateCurrentQuestionSchema = z.object({
  index: z.number(),
  total: z.number(),
  text: z.string(),
  is_follow_up: z.boolean().default(false),
  message_id: z.number().nullable().default(null),
});

// New conversational-interview fields default gracefully so an older payload still renders.
export const candidateInterviewStateSchema: ZodType<CandidateInterviewState> = z.object({
  status: interviewStatusSchema,
  language: z.enum(["id", "en"]).catch("id"),
  mode: z.enum(["template", "conversational"]).catch("template"),
  acknowledgements: z.array(z.string()).catch([]),
  speech_lang: z.string().default(""),
  interviewer_name: z.string().default(""),
  candidate_name: z.string().default(""),
  candidate_first_name: z.string(),
  job_title: z.string(),
  company_name: z.string(),
  instructions: z.array(z.string()),
  privacy_notice: z.string(),
  duration_minutes: z.number(),
  questions_total: z.number(),
  started_at: z.string().nullable().default(null),
  questions_answered: z.number(),
  current_question: candidateCurrentQuestionSchema.nullable().default(null),
  consent_given: z.boolean(),
  expires_at: z.string(),
  voice: z.object({ server_tts: z.boolean().catch(false) }).catch({ server_tts: false }),
  messages: z.array(
    z.object({
      id: z.number(),
      role: z.enum(["assistant", "candidate"]),
      content: z.string(),
      created_at: z.string(),
    }),
  ),
});

// ---------- Public application form (applicant-facing, no login) ----------

export const FORM_FIELD_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "date",
  "url",
  "select",
  "multi_select",
  "checkbox",
  "yes_no",
] as const satisfies readonly FormFieldType[];

const formFieldTypeSchema: ZodType<FormFieldType> = z.enum(FORM_FIELD_TYPES);

// `screening` (HR-only expected answers) is never sent to applicants; unknown keys are stripped anyway.
export const formFieldSchema: ZodType<FormField> = z.object({
  id: z.string().min(1),
  label: z.string(),
  type: formFieldTypeSchema,
  required: z.boolean(),
  help_text: z.string().nullable(),
  placeholder: z.string().nullable(),
  options: z.array(z.string()),
  max_length: z.number().nullable(),
});

const builtInFormFieldSchema: ZodType<BuiltInFormField> = z.object({
  id: z.enum(["full_name", "email", "phone", "cv"]),
  label: z.string(),
  type: z.enum(["short_text", "email", "phone", "file"]),
  required: z.literal(true),
  built_in: z.literal(true),
});

export const publicApplicationFormSchema: ZodType<PublicApplicationForm> = z.object({
  slug: z.string(),
  title: z.string(),
  intro: z.string().nullable(),
  company_name: z.string(),
  job: z.object({
    title: z.string(),
    department: z.string().nullable(),
    location: z.string().nullable(),
    description: z.string(),
    required_skills: z.array(z.string()),
    preferred_skills: z.array(z.string()),
    min_experience_years: z.number().nullable(),
    opens_on: z.string().nullable().default(null),
    closes_on: z.string().nullable().default(null),
    opens_time: z.string().nullable().default(null),
    closes_time: z.string().nullable().default(null),
    opens_at: z.string().nullable().default(null),
    closes_at: z.string().nullable().default(null),
    // Defaults keep responses from older backends parseable.
    employment_type: z.enum(["full_time", "part_time", "contract", "internship", "freelance"]).default("full_time"),
    salary_min: z.number().nullable().default(null),
    salary_max: z.number().nullable().default(null),
  }),
  built_in_fields: z.array(builtInFormFieldSchema),
  fields: z.array(formFieldSchema),
  accepting_applications: z.boolean(),
  closed_reason: z
    .enum(["draft", "closed", "job_draft", "not_yet_open", "deadline_passed"])
    .nullable()
    .default(null),
  closes_at: z.string().nullable(),
  max_upload_mb: z.number().positive(),
  privacy_notice: z.string(),
});

export const applicationSubmittedSchema: ZodType<ApplicationSubmitted> = z.object({
  reference: z.string(),
  message: z.string(),
});
