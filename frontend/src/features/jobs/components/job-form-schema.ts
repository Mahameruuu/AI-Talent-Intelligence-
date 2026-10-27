import { z } from "zod";
import type { Job, JobInput } from "@/types/api";
import { EDUCATION_LEVELS, EMPLOYMENT_TYPES } from "@/utils/labels";
import { JOB_STATUSES } from "../job-utils";

/** Optional wall-clock time from `<input type="time">`: "" (not set) or "HH:MM" (seconds tolerated). */
const timeSchema = z
  .string()
  .regex(/^$|^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use a time like 14:00.");

export const AUTO_INVITE_TIMINGS = ["next_morning", "on_close"] as const;

const salarySchema = z
  .number({ error: "Enter an amount in rupiah." })
  .int("Use whole rupiah.")
  .min(0, "Can't be negative.")
  .max(10_000_000_000, "Use 10,000,000,000 or less.")
  .nullable();

export const jobFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Enter a job title.")
      .min(2, "Use at least 2 characters.")
      .max(200, "Keep the title to 200 characters or fewer."),
    department: z.string().trim().max(120, "Keep the department to 120 characters or fewer."),
    location: z.string().trim().max(120, "Keep the location to 120 characters or fewer."),
    // Mirrors the backend rule (10–20000 characters).
    description: z
      .string()
      .trim()
      .min(1, "Add a job description.")
      .min(10, "Use at least 10 characters for the job description.")
      .max(20000, "Keep the description to 20,000 characters or fewer."),
    required_skills: z.array(z.string()).min(1, "Add at least one required skill."),
    preferred_skills: z.array(z.string()),
    required_certifications: z.array(z.string()),
    /** "" = Not specified (sent as null). */
    education_level: z.union([z.literal(""), z.enum(EDUCATION_LEVELS)]),
    education_field: z.string().trim().max(200, "Keep the field to 200 characters or fewer."),
    min_experience_years: z
      .number({ error: "Enter a number of years." })
      .min(0, "Can't be negative.")
      .max(50, "Use 50 years or less.")
      .refine((value) => Number.isInteger(value * 2), "Use whole or half years, e.g. 2.5.")
      .nullable(),
    status: z.enum(JOB_STATUSES),
    employment_type: z.enum(EMPLOYMENT_TYPES, { error: "Choose an employment type." }),
    /** Monthly salary in IDR; null = not set. Mirrors the backend limits (0–10 billion, whole rupiah). */
    salary_min: salarySchema,
    salary_max: salarySchema,
    salary_visible: z.boolean(),
    /** Application period, "YYYY-MM-DD" (inclusive). */
    opens_on: z.string().min(1, "Choose the date applications open."),
    closes_on: z.string().min(1, "Choose the application deadline."),
    /** Optional times (WIB): "" = 00:00 for opening, end of the day (23:59) for closing. */
    opens_time: timeSchema,
    closes_time: timeSchema,
    /** Automatic AI-interview invitations after the deadline. */
    auto_invite_enabled: z.boolean(),
    auto_invite_top_n: z
      .number({ error: "Enter a number from 1 to 100." })
      .int("Use a whole number.")
      .min(1, "Invite at least 1 applicant.")
      .max(100, "Use 100 or fewer.")
      .nullable(),
    auto_invite_min_score: z
      .number({ error: "Enter a score from 0 to 100." })
      .min(0, "Use a score from 0 to 100.")
      .max(100, "Use a score from 0 to 100.")
      .nullable(),
    /** next_morning = 08:00 WIB the day after closing; on_close = right after applications close. */
    auto_invite_timing: z.enum(AUTO_INVITE_TIMINGS),
  })
  .superRefine((values, ctx) => {
    // ISO dates (and "YYYY-MM-DDTHH:MM" moments) compare correctly as strings.
    if (values.opens_on && values.closes_on && values.closes_on < values.opens_on) {
      ctx.addIssue({ code: "custom", path: ["closes_on"], message: "The deadline can't be before the opening date." });
    } else if (
      values.opens_on &&
      values.closes_on &&
      periodMoment(values.closes_on, values.closes_time, "close") <= periodMoment(values.opens_on, values.opens_time, "open")
    ) {
      ctx.addIssue({ code: "custom", path: ["closes_time"], message: "Applications must close after they open." });
    }
    if (values.salary_min !== null && values.salary_max !== null && values.salary_max < values.salary_min) {
      ctx.addIssue({ code: "custom", path: ["salary_max"], message: "The maximum can't be lower than the minimum." });
    }
    // A skill can't be both required and preferred (case-insensitive).
    const required = new Set(values.required_skills.map((skill) => skill.trim().toLowerCase()));
    const duplicates = values.preferred_skills.filter((skill) => required.has(skill.trim().toLowerCase()));
    if (duplicates.length > 0) {
      const list = duplicates.map((skill) => `“${skill}”`).join(", ");
      ctx.addIssue({
        code: "custom",
        path: ["preferred_skills"],
        message: `${list} ${duplicates.length === 1 ? "is" : "are"} already required — remove ${duplicates.length === 1 ? "it" : "them"} from one of the lists.`,
      });
    }
    if (values.auto_invite_enabled && values.auto_invite_top_n === null) {
      ctx.addIssue({ code: "custom", path: ["auto_invite_top_n"], message: "Enter how many applicants to invite." });
    }
  });

export type JobFormValues = z.infer<typeof jobFormSchema>;

/** "YYYY-MM-DDTHH:MM:SS" for comparing opening/closing moments; an empty time is 00:00 / 23:59:59. */
function periodMoment(day: string, time: string, edge: "open" | "close"): string {
  const clock = time ? (time.length === 5 ? `${time}:00` : time) : edge === "open" ? "00:00:00" : "23:59:59";
  return `${day}T${clock}`;
}

/** "HH:MM" for the API, or null when the time input is empty. */
export function toApiTime(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, 5);
}

/** Default number of applicants invited automatically. */
export const DEFAULT_AUTO_INVITE_TOP_N = 10;

/** Default length of a new job's application period. */
export const DEFAULT_PERIOD_DAYS = 30;

/** "YYYY-MM-DD" in the user's local timezone (not UTC, so late-evening dates don't shift). */
export function isoLocalDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}
export type JobFormMode = "create" | "edit";

/** Initial form values: empty for create, the job's current values for edit. */
export function toFormValues(job: Job | undefined, _mode?: JobFormMode): JobFormValues {
  if (!job) {
    return {
      title: "",
      department: "",
      location: "",
      description: "",
      required_skills: [],
      preferred_skills: [],
      required_certifications: [],
      education_level: "",
      education_field: "",
      min_experience_years: null,
      status: "open",
      employment_type: "full_time",
      salary_min: null,
      salary_max: null,
      salary_visible: false,
      opens_on: isoLocalDate(new Date()),
      closes_on: isoLocalDate(addDays(new Date(), DEFAULT_PERIOD_DAYS)),
      opens_time: "",
      closes_time: "",
      auto_invite_enabled: true,
      auto_invite_top_n: DEFAULT_AUTO_INVITE_TOP_N,
      auto_invite_min_score: null,
      auto_invite_timing: "next_morning",
    };
  }
  return {
    title: job.title,
    department: job.department ?? "",
    location: job.location ?? "",
    description: job.description,
    required_skills: [...job.required_skills],
    preferred_skills: [...job.preferred_skills],
    required_certifications: [...job.required_certifications],
    education_level: job.education_level ?? "",
    education_field: job.education_field ?? "",
    min_experience_years: job.min_experience_years,
    status: job.status,
    employment_type: job.employment_type ?? "full_time",
    salary_min: job.salary_min ?? null,
    salary_max: job.salary_max ?? null,
    salary_visible: job.salary_visible ?? false,
    // Older jobs without a period get today's defaults so a deadline is always set when saving.
    opens_on: job.opens_on ?? isoLocalDate(new Date()),
    closes_on: job.closes_on ?? isoLocalDate(addDays(new Date(), DEFAULT_PERIOD_DAYS)),
    opens_time: job.opens_time ?? "",
    closes_time: job.closes_time ?? "",
    // Older backends may not send auto_invite yet.
    auto_invite_enabled: job.auto_invite?.enabled ?? false,
    auto_invite_top_n: job.auto_invite?.top_n ?? DEFAULT_AUTO_INVITE_TOP_N,
    auto_invite_min_score: job.auto_invite?.min_score ?? null,
    auto_invite_timing: job.auto_invite?.timing ?? "next_morning",
  };
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Trim, drop empties and dedupe case-insensitively (keeping the first spelling). */
function cleanList(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ");
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

/**
 * Build the exact `JobInput` payload. Empty optional strings become null.
 * Scoring weights are organisation-wide (Settings), so they are never part of a job.
 */
export function toJobInput(values: JobFormValues): JobInput {
  const input: JobInput = {
    title: values.title.trim(),
    department: emptyToNull(values.department),
    location: emptyToNull(values.location),
    description: values.description.trim(),
    required_skills: cleanList(values.required_skills),
    preferred_skills: cleanList(values.preferred_skills),
    required_certifications: cleanList(values.required_certifications),
    min_experience_years: values.min_experience_years,
    education_level: values.education_level === "" ? null : values.education_level,
    education_field: emptyToNull(values.education_field),
    status: values.status,
    employment_type: values.employment_type,
    salary_min: values.salary_min,
    salary_max: values.salary_max,
    salary_visible: values.salary_visible,
    opens_on: values.opens_on,
    closes_on: values.closes_on,
    opens_time: toApiTime(values.opens_time),
    closes_time: toApiTime(values.closes_time),
    auto_invite: {
      enabled: values.auto_invite_enabled,
      top_n: values.auto_invite_top_n ?? DEFAULT_AUTO_INVITE_TOP_N,
      min_score: values.auto_invite_min_score,
      timing: values.auto_invite_timing,
    },
  };
  return input;
}

/** For number inputs: "" (or anything non-numeric) => null, never NaN or 0. */
export function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}
