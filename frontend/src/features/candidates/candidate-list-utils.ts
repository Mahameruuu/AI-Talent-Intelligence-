import type { Application, ApplicationStage } from "@/types/api";
import { STAGE_ORDER } from "@/utils/labels";
import { SCORE_TONE_LABELS, scoreTone } from "@/utils/score";

export function isStage(value: string): value is ApplicationStage {
  return (STAGE_ORDER as string[]).includes(value);
}

/** "Strong match" (≥75), "Good match" (50–74), "Low match" (<50); null when not scored. */
export function matchCategory(score: number | null | undefined): string | null {
  const tone = scoreTone(score);
  return tone === "none" ? null : SCORE_TONE_LABELS[tone];
}

/** Link to the applicant's single-page screening result for this application. */
export function applicantHref(application: Pick<Application, "id" | "candidate_id">): string {
  return `/candidates/${application.candidate_id}?application=${application.id}`;
}

/**
 * The applicant's email when the application carries it (form answer of type email).
 * Applications don't include the candidate's profile email, so this may be null.
 */
export function applicantEmail(application: Pick<Application, "form_answers" | "candidate_email">): string | null {
  if (application.candidate_email) return application.candidate_email;
  const answer = (application.form_answers ?? []).find(
    (item) => item.field_id === "email" || item.type === "email",
  );
  return typeof answer?.value === "string" && answer.value.trim() !== "" ? answer.value : null;
}
