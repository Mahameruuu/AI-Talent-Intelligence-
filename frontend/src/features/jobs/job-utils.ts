import type { Job, JobStatus, ScoringWeights } from "@/types/api";
import { formatDay } from "@/utils/format";
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

/** "Data Scientist · Full-time · until 30 Nov 2026" (subtitle of the application form). */
export function jobSubtitle(job: Pick<Job, "title" | "employment_type" | "closes_on">): string {
  const parts = [job.title, EMPLOYMENT_TYPE_LABELS[job.employment_type]];
  if (job.closes_on) parts.push(`until ${formatDay(job.closes_on)}`);
  return parts.filter(Boolean).join(" · ");
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
