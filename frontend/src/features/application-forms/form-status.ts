import type { ApplicationForm } from "@/types/api";

export type AcceptingState = "accepting" | "draft" | "closed" | "job_closed" | "deadline_passed" | "not_yet_open";

/**
 * Why a form is (not) accepting applications. The server's `accepting_applications` is the
 * source of truth; the reason is inferred for display only.
 */
export function acceptingState(
  form: Pick<ApplicationForm, "status" | "accepting_applications" | "closes_at"> &
    Partial<Pick<ApplicationForm, "closed_reason">>,
  now: Date = new Date(),
): AcceptingState {
  if (form.accepting_applications) return "accepting";
  if (form.status === "draft") return "draft";
  if (form.status === "closed") return "closed";
  // The server knows the job's application period (in WIB); trust its reason when given.
  if (form.closed_reason === "not_yet_open") return "not_yet_open";
  if (form.closed_reason === "deadline_passed") return "deadline_passed";
  if (form.closes_at && new Date(form.closes_at).getTime() < now.getTime()) return "deadline_passed";
  // Published, before the deadline, yet not accepting: the job itself is closed.
  return "job_closed";
}

export const ACCEPTING_LABELS: Record<AcceptingState, string> = {
  accepting: "Accepting applications",
  draft: "Not live yet",
  closed: "Not accepting",
  job_closed: "Job closed",
  deadline_passed: "Deadline passed",
  not_yet_open: "Opens soon",
};

/** ISO string -> value for <input type="datetime-local"> in local time ("" when empty). */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** <input type="datetime-local"> value -> ISO string (null when empty or invalid). */
export function fromDateTimeLocal(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
