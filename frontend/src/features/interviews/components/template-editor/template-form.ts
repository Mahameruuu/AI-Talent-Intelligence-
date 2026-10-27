import { z } from "zod";
import type { Competency, InterviewMode, InterviewQuestion, InterviewTemplate, InterviewTemplateInput } from "@/types/api";

export const RUBRIC_SCORES = [1, 2, 3, 4, 5] as const;

export const LIMITS = {
  numQuestions: { min: 1, max: 30 },
  duration: { min: 5, max: 180 },
  followUps: { min: 0, max: 5 },
  minAnswerWords: { min: 0, max: 300 },
  expiryHours: { min: 1, max: 720 },
  cvQuestions: { min: 0, max: 5 },
  weight: { max: 100 },
} as const;

/** Conversational mode limits (must match the backend). num_questions counts every main AI question. */
export const CONVERSATIONAL_LIMITS = {
  numQuestions: { min: 3, max: 5, default: 5 },
  duration: { min: 5, max: 10, default: 7 },
} as const;

export const INTERVIEW_MODES = ["conversational", "template"] as const satisfies readonly InterviewMode[];

/**
 * Values that keep a template valid after switching to conversational mode:
 * out-of-range question counts snap to 5 and durations to 7 minutes.
 */
export function conversationalSettings(numQuestions: number, durationMinutes: number) {
  const { numQuestions: nq, duration } = CONVERSATIONAL_LIMITS;
  const inRange = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  return {
    num_questions: inRange(numQuestions, nq.min, nq.max) ? numQuestions : nq.default,
    duration_minutes: inRange(durationMinutes, duration.min, duration.max) ? durationMinutes : duration.default,
  };
}

function numberField(label: string) {
  return z.number({ error: `${label} must be a number` });
}

function intInRange(label: string, min: number, max: number) {
  return numberField(label)
    .int(`${label} must be a whole number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);
}

const rubricLevelSchema = z.object({
  score: z.number().int().min(1).max(5),
  descriptor: z.string().trim().min(1, "Describe what this level looks like").max(500, "Keep it under 500 characters"),
});

const competencySchema = z.object({
  name: z.string().trim().min(1, "Competency name is required").max(80, "Keep it under 80 characters"),
  description: z.string().trim().max(500, "Keep it under 500 characters"),
  weight: numberField("Weight")
    .positive("Weight must be greater than 0")
    .max(LIMITS.weight.max, `Weight must be at most ${LIMITS.weight.max}`),
  rubric: z.array(rubricLevelSchema).length(5, "The rubric needs exactly 5 levels"),
});

const questionSchema = z.object({
  id: z.string().min(1),
  competency: z.string().min(1, "Choose a competency"),
  text: z.string().trim().min(1, "Question text is required").max(1000, "Keep it under 1000 characters"),
});

export const templateFormSchema = z
  .object({
    job_id: z.number({ error: "Choose a job" }).int().positive("Choose a job"),
    name: z.string().trim().min(1, "Template name is required").max(120, "Keep it under 120 characters"),
    language: z.enum(["id", "en"], { error: "Choose the interview language" }),
    mode: z.enum(INTERVIEW_MODES, { error: "Choose an interview style" }),
    cv_questions: intInRange("CV-based questions", LIMITS.cvQuestions.min, LIMITS.cvQuestions.max),
    competencies: z.array(competencySchema).min(1, "Add at least one competency").max(12, "Use at most 12 competencies"),
    // At least one question is required in template mode only (checked below); conversational
    // templates may leave the guidance questions empty.
    questions: z.array(questionSchema).max(60, "Use at most 60 questions"),
    num_questions: intInRange("Questions asked", LIMITS.numQuestions.min, LIMITS.numQuestions.max),
    duration_minutes: intInRange("Duration", LIMITS.duration.min, LIMITS.duration.max),
    follow_up_rules: z.object({
      max_follow_ups_per_question: intInRange("Follow-ups", LIMITS.followUps.min, LIMITS.followUps.max),
      min_answer_words: intInRange("Minimum answer length", LIMITS.minAnswerWords.min, LIMITS.minAnswerWords.max),
    }),
    invitation_expiry_hours: intInRange("Link validity", LIMITS.expiryHours.min, LIMITS.expiryHours.max),
  })
  .superRefine((values, ctx) => {
    const seen = new Map<string, number>();
    values.competencies.forEach((competency, index) => {
      const key = competency.name.trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", path: ["competencies", index, "name"], message: "Competency names must be unique" });
      } else {
        seen.set(key, index);
      }
    });

    const names = new Set(values.competencies.map((competency) => competency.name.trim()));
    values.questions.forEach((question, index) => {
      if (question.competency && !names.has(question.competency.trim())) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", index, "competency"],
          message: "Choose one of the competencies defined above",
        });
      }
    });

    if (values.mode === "conversational") {
      const { numQuestions, duration } = CONVERSATIONAL_LIMITS;
      if (Number.isFinite(values.num_questions) && (values.num_questions < numQuestions.min || values.num_questions > numQuestions.max)) {
        ctx.addIssue({
          code: "custom",
          path: ["num_questions"],
          message: `Conversational interviews ask ${numQuestions.min}–${numQuestions.max} questions`,
        });
      }
      if (Number.isFinite(values.duration_minutes) && (values.duration_minutes < duration.min || values.duration_minutes > duration.max)) {
        ctx.addIssue({
          code: "custom",
          path: ["duration_minutes"],
          message: `Conversational interviews last ${duration.min}–${duration.max} minutes`,
        });
      }
      return;
    }

    if (values.questions.length === 0) {
      ctx.addIssue({ code: "custom", path: ["questions"], message: "Add at least one question" });
    }

    if (values.questions.length > 0 && values.num_questions > values.questions.length) {
      ctx.addIssue({
        code: "custom",
        path: ["num_questions"],
        message: `Can't ask more questions than the template contains (${values.questions.length})`,
      });
    }
  });

export type TemplateFormValues = z.infer<typeof templateFormSchema>;
export type CompetencyFormValues = TemplateFormValues["competencies"][number];
export type QuestionFormValues = TemplateFormValues["questions"][number];

export function emptyRubric(): CompetencyFormValues["rubric"] {
  return RUBRIC_SCORES.map((score) => ({ score, descriptor: "" }));
}

export function emptyCompetency(): CompetencyFormValues {
  return { name: "", description: "", weight: 1, rubric: emptyRubric() };
}

/** Always 5 levels, ordered 1..5, whatever the API returned. */
function normalizeRubric(rubric: Competency["rubric"] | undefined): CompetencyFormValues["rubric"] {
  return RUBRIC_SCORES.map((score) => ({
    score,
    descriptor: rubric?.find((level) => level.score === score)?.descriptor ?? "",
  }));
}

function randomSuffix(): string {
  const cryptoApi: Crypto | undefined = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID().slice(0, 8);
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.slice(-8);
}

/** Stable string id for a new question, unique among `existing`. */
export function newQuestionId(existing: Iterable<string> = []): string {
  const taken = new Set(existing);
  let id = `q-${randomSuffix()}`;
  while (taken.has(id)) id = `q-${randomSuffix()}`;
  return id;
}

/** Competency the backend adds automatically for personalised CV questions. */
export const CV_COMPETENCY_NAME = "Pendalaman Pengalaman CV";

export const DEFAULT_SETTINGS = {
  language: "id",
  mode: "template",
  cv_questions: 2,
  num_questions: 6,
  duration_minutes: 30,
  follow_up_rules: { max_follow_ups_per_question: 1, min_answer_words: 25 },
  invitation_expiry_hours: 72,
} as const satisfies Pick<InterviewTemplateInput, "language" | "mode" | "cv_questions" | "num_questions" | "duration_minutes" | "follow_up_rules" | "invitation_expiry_hours">;

export type TemplateFormDefaults = Omit<TemplateFormValues, "job_id"> & { job_id: number | undefined };

export function emptyTemplateValues(jobId: number | undefined): TemplateFormDefaults {
  return {
    job_id: jobId,
    name: "",
    language: DEFAULT_SETTINGS.language,
    mode: DEFAULT_SETTINGS.mode,
    cv_questions: DEFAULT_SETTINGS.cv_questions,
    competencies: [emptyCompetency()],
    questions: [],
    num_questions: DEFAULT_SETTINGS.num_questions,
    duration_minutes: DEFAULT_SETTINGS.duration_minutes,
    follow_up_rules: { ...DEFAULT_SETTINGS.follow_up_rules },
    invitation_expiry_hours: DEFAULT_SETTINGS.invitation_expiry_hours,
  };
}

/** API template (or suggestion) -> form values. */
export function toFormValues(source: InterviewTemplate | InterviewTemplateInput): TemplateFormValues {
  const usedIds = new Set<string>();
  const questions: QuestionFormValues[] = source.questions.map((question) => {
    let id = question.id?.trim() ? question.id : newQuestionId(usedIds);
    if (usedIds.has(id)) id = newQuestionId(usedIds);
    usedIds.add(id);
    return { id, competency: question.competency, text: question.text };
  });
  return {
    job_id: source.job_id,
    name: source.name,
    language: source.language ?? DEFAULT_SETTINGS.language,
    // Older payloads have no mode: they are fixed-question templates.
    mode: source.mode ?? DEFAULT_SETTINGS.mode,
    cv_questions: source.cv_questions ?? DEFAULT_SETTINGS.cv_questions,
    competencies: source.competencies.map((competency) => ({
      name: competency.name,
      description: competency.description ?? "",
      weight: competency.weight,
      rubric: normalizeRubric(competency.rubric),
    })),
    questions,
    num_questions: source.num_questions,
    duration_minutes: source.duration_minutes,
    follow_up_rules: {
      max_follow_ups_per_question: source.follow_up_rules.max_follow_ups_per_question,
      min_answer_words: source.follow_up_rules.min_answer_words,
    },
    invitation_expiry_hours: source.invitation_expiry_hours,
  };
}

/** Validated form values -> API payload (trimmed, rubric scores fixed to 1..5). */
export function toTemplateInput(values: TemplateFormValues): InterviewTemplateInput {
  const competencies: Competency[] = values.competencies.map((competency) => ({
    name: competency.name.trim(),
    description: competency.description.trim(),
    weight: competency.weight,
    rubric: competency.rubric.map((level, index) => ({ score: index + 1, descriptor: level.descriptor.trim() })),
  }));
  const questions: InterviewQuestion[] = values.questions.map((question) => ({
    id: question.id,
    competency: question.competency.trim(),
    text: question.text.trim(),
  }));
  return {
    job_id: values.job_id,
    name: values.name.trim(),
    language: values.language,
    mode: values.mode,
    // Ignored by the backend in conversational mode; sent unchanged.
    cv_questions: values.cv_questions,
    competencies,
    questions,
    num_questions: values.num_questions,
    duration_minutes: values.duration_minutes,
    follow_up_rules: { ...values.follow_up_rules },
    invitation_expiry_hours: values.invitation_expiry_hours,
  };
}

/** Relative weight -> percentage share of the total (0 when the total is not positive). */
export function weightShare(weight: number, total: number): number {
  if (!Number.isFinite(weight) || !Number.isFinite(total) || total <= 0 || weight <= 0) return 0;
  return (weight / total) * 100;
}

// ---------------------------------------------------------------- error summary

export interface FormErrorItem {
  /** react-hook-form field path, e.g. "competencies.1.rubric.0.descriptor" (used to focus the field). */
  path: string;
  /** Where the problem is, in words, e.g. "Competency 2 “Komunikasi” – rubric level 1". */
  location: string;
  message: string;
}

const FIELD_LABELS: Record<string, string> = {
  job_id: "Job",
  name: "Template name",
  language: "Interview language",
  mode: "Interview style",
  cv_questions: "CV-based questions per candidate",
  num_questions: "Template questions per interview",
  duration_minutes: "Expected duration",
  invitation_expiry_hours: "Invitation link valid for",
  "follow_up_rules.max_follow_ups_per_question": "Max. follow-ups per question",
  "follow_up_rules.min_answer_words": "Min. answer length",
  competencies: "Competencies",
  questions: "Question bank",
};

function describeLocation(path: string, values: Partial<TemplateFormValues>): string {
  const competency = /^competencies\.(\d+)(?:\.(\w+))?(?:\.(\d+)\.descriptor)?/.exec(path);
  if (competency) {
    const index = Number(competency[1]);
    const name = values.competencies?.[index]?.name?.trim();
    const head = `Competency ${index + 1}${name ? ` “${name}”` : ""}`;
    if (competency[2] === "rubric" && competency[3] !== undefined) return `${head} – rubric level ${Number(competency[3]) + 1}`;
    if (competency[2] === "rubric") return `${head} – scoring rubric`;
    if (competency[2]) return `${head} – ${competency[2]}`;
    return head;
  }
  const question = /^questions\.(\d+)(?:\.(\w+))?/.exec(path);
  if (question) {
    const head = `Question ${Number(question[1]) + 1}`;
    return question[2] ? `${head} – ${question[2] === "text" ? "question text" : question[2]}` : head;
  }
  return FIELD_LABELS[path] ?? path;
}

/** Flatten react-hook-form errors into a readable, ordered list (top of the form first). */
export function describeFormErrors(errors: unknown, values: Partial<TemplateFormValues>): FormErrorItem[] {
  const items: FormErrorItem[] = [];
  const walk = (node: unknown, path: string) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) {
      items.push({ path, location: describeLocation(path, values), message: record.message });
    }
    for (const [key, child] of Object.entries(record)) {
      if (key === "ref" || key === "message" || key === "type" || key === "types") continue;
      walk(child, key === "root" ? path : path ? `${path}.${key}` : key);
    }
  };
  walk(errors, "");
  const order = ["job_id", "name", "mode", "competencies", "questions", "language", "cv_questions", "num_questions"];
  const rank = (path: string) => {
    const index = order.findIndex((prefix) => path === prefix || path.startsWith(`${prefix}.`));
    return index === -1 ? order.length : index;
  };
  return items
    .filter((item, index, all) => all.findIndex((other) => other.path === item.path && other.message === item.message) === index)
    .sort((a, b) => rank(a.path) - rank(b.path));
}
