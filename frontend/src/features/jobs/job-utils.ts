import type { AutoInviteTiming, Job, JobStatus, ScoringWeights } from "@/types/api";
import { addCalendarDays, formatClock, formatDayTime } from "@/utils/format";
import { EMPLOYMENT_TYPE_LABELS, WEIGHT_KEYS } from "@/utils/labels";

export const JOB_STATUSES: JobStatus[] = ["draft", "open", "closed"];

export function isJobStatus(value: string | null | undefined): value is JobStatus {
  return JOB_STATUSES.includes(value as JobStatus);
}

/**
 * Suggested starting point for custom weights in the job form. Only used to pre-fill the
 * inputs when HR opts into custom weights; otherwise the backend applies its own defaults.
 */
export const STARTING_POINT_WEIGHTS: ScoringWeights = {
  required_skills: 40,
  preferred_skills: 10,
  experience: 20,
  education: 10,
  certifications: 5,
  semantic: 15,
  screening_questions: 0,
};

export type WeightKey = keyof ScoringWeights;

export interface WeightShare {
  key: WeightKey;
  /** Configured weight, or null when the input is empty. */
  value: number | null;
  /** Share of the total in percent (0..100); 0 when the total is 0. */
  share: number;
}

/** Each weight's share of the total. Weights are relative: share = weight ÷ total. */
export function weightShares(weights: Partial<Record<WeightKey, number | null | undefined>>): {
  total: number;
  shares: WeightShare[];
} {
  const values = WEIGHT_KEYS.map((key) => {
    const raw = weights[key];
    const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    return { key, value };
  });
  const total = values.reduce((sum, item) => sum + Math.max(0, item.value ?? 0), 0);
  return {
    total,
    shares: values.map(({ key, value }) => ({
      key,
      value,
      share: total > 0 && value !== null ? (Math.max(0, value) / total) * 100 : 0,
    })),
  };
}

/** "Engineering · Jakarta" (only the parts that exist). */
export function jobMetaLine(job: Pick<Job, "department" | "location">): string {
  return [job.department, job.location].filter((part): part is string => Boolean(part && part.trim())).join(" · ");
}

/**
 * "Data Scientist · Full-time · until 30 Nov 2026, 14:00 WIB" (subtitle of the application form);
 * the time is left out when the job closes at the end of the day.
 */
export function jobSubtitle(job: Pick<Job, "title" | "employment_type" | "closes_on"> & { closes_time?: string | null }): string {
  const parts = [job.title, EMPLOYMENT_TYPE_LABELS[job.employment_type]];
  if (job.closes_on) parts.push(`until ${formatDayTime(job.closes_on, job.closes_time, { suffix: " WIB" })}`);
  return parts.filter(Boolean).join(" · ");
}

/** Hour of the "next morning" invitations (backend AUTO_INVITE_HOUR). */
export const AUTO_INVITE_MORNING = "08:00";

/**
 * When automatic invitations go out, as a WIB calendar day + "HH:MM" (mirrors the backend `send_at`):
 * next_morning → the day after closing at 08:00; on_close → the closing time, or 00:00 the next day
 * when the job closes at the end of the day. Null without a valid closing day.
 */
export function autoInviteSendMoment(
  closesOn: string | null | undefined,
  closesTime: string | null | undefined,
  timing: AutoInviteTiming,
): { day: string; time: string } | null {
  if (!closesOn) return null;
  const clock = formatClock(closesTime);
  if (timing === "on_close" && clock) return { day: closesOn, time: clock };
  const nextDay = addCalendarDays(closesOn, 1);
  if (!nextDay) return null;
  return { day: nextDay, time: timing === "on_close" ? "00:00" : AUTO_INVITE_MORNING };
}

/** Human-readable lines from an API error's `details` (e.g. field validation messages). */
export function describeErrorDetails(details: unknown): string[] {
  if (!details || typeof details !== "object") return [];
  if (Array.isArray(details)) {
    return details.filter((item): item is string => typeof item === "string");
  }
  const lines: string[] = [];
  for (const [field, value] of Object.entries(details as Record<string, unknown>)) {
    const label = field.replace(/[_-]+/g, " ");
    if (typeof value === "string") lines.push(`${label}: ${value}`);
    else if (Array.isArray(value)) {
      const messages = value.filter((item): item is string => typeof item === "string");
      if (messages.length > 0) lines.push(`${label}: ${messages.join(", ")}`);
    }
  }
  return lines;
}
