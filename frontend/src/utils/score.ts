export type ScoreTone = "high" | "medium" | "low" | "none";

/** Bands used consistently for match scores (0..100). */
export function scoreTone(score: number | null | undefined): ScoreTone {
  if (score === null || score === undefined || Number.isNaN(score)) return "none";
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export const SCORE_TONE_LABELS: Record<ScoreTone, string> = {
  high: "Strong match",
  medium: "Good match",
  low: "Low match",
  none: "Not scored",
};

export function clampScore(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

/** Shown wherever a match score is presented. */
export const MATCH_DISCLAIMER = "Match with job criteria — not a prediction of job success. Final decisions are made by HR.";
