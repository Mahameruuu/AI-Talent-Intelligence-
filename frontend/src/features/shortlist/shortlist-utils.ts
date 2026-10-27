import { summarizeScreening } from "./screening-summary";
import type { Application, ApplicationSource, ApplicationStage, ScreeningListItem, ScreeningResult } from "@/types/api";

/** Stages the backend accepts for `POST /jobs/{id}/shortlist`. */
export const SHORTLISTABLE_STAGES: readonly ApplicationStage[] = ["applied", "screening"];

export const DEFAULT_TOP_N = 10;

export interface ShortlistRow {
  applicationId: number;
  candidateId: number;
  candidateName: string;
  stage: ApplicationStage;
  source: ApplicationSource | null;
  /** Match score with the job criteria (0..100); null when not screened or not computable. */
  score: number | null;
  /** A completed screening with a score exists. */
  screened: boolean;
  screeningFailed: boolean;
  required: { total: number; matched: number; missing: number };
  flags: ScreeningResult["flags"];
  /** 1-based position among scored candidates; null when unscored. */
  rank: number | null;
}

export function isShortlistable(row: Pick<ShortlistRow, "stage">): boolean {
  return SHORTLISTABLE_STAGES.includes(row.stage);
}

/** Keep the most recent screening per application. */
function latestScreenings(screenings: ScreeningListItem[]): Map<number, ScreeningListItem> {
  const byApplication = new Map<number, ScreeningListItem>();
  for (const item of screenings) {
    const current = byApplication.get(item.application_id);
    if (!current || item.id > current.id) byApplication.set(item.application_id, item);
  }
  return byApplication;
}

function compareRows(a: ShortlistRow, b: ShortlistRow): number {
  if (a.score === null && b.score !== null) return 1;
  if (a.score !== null && b.score === null) return -1;
  if (a.score !== null && b.score !== null && a.score !== b.score) return b.score - a.score;
  return a.candidateName.localeCompare(b.candidateName);
}

/**
 * Merge a job's applications with their latest screening results into ranked rows:
 * highest match score first, unscored candidates last.
 */
export function buildShortlistRows(applications: Application[], screenings: ScreeningListItem[]): ShortlistRow[] {
  const screeningByApp = latestScreenings(screenings);
  const rows: ShortlistRow[] = [];
  const seen = new Set<number>();

  const toRow = (application: Application | null, screening: ScreeningListItem | undefined): ShortlistRow | null => {
    const base = application ?? screening;
    if (!base) return null;
    const failed = screening?.status === "failed";
    const score = screening ? (failed ? null : screening.overall_score) : (application?.match_score ?? null);
    const summary = screening ? summarizeScreening(screening) : null;
    return {
      applicationId: application?.id ?? (screening as ScreeningListItem).application_id,
      candidateId: base.candidate_id,
      candidateName: application?.candidate_name ?? screening?.candidate_name ?? "",
      stage: application?.stage ?? (screening as ScreeningListItem).stage,
      source: application?.source ?? null,
      score,
      screened: score !== null,
      screeningFailed: failed,
      required: summary
        ? {
            total: summary.requiredSkills.total,
            matched: summary.requiredSkills.matched,
            missing: summary.requiredSkills.missing,
          }
        : { total: 0, matched: 0, missing: 0 },
      flags: screening?.flags ?? [],
      rank: null,
    };
  };

  for (const application of applications) {
    const row = toRow(application, screeningByApp.get(application.id));
    if (row) rows.push(row);
    seen.add(application.id);
  }
  for (const [applicationId, screening] of screeningByApp) {
    if (seen.has(applicationId)) continue;
    const row = toRow(null, screening);
    if (row) rows.push(row);
  }

  rows.sort(compareRows);
  let rank = 0;
  return rows.map((row) => (row.score === null ? row : { ...row, rank: (rank += 1) }));
}

/**
 * Application ids of the top `n` screened candidates still in applied/screening,
 * optionally only those scoring at least `minScore`. Unscreened, failed, rejected or
 * already-advanced candidates are never preselected.
 */
export function selectTopN(rows: ShortlistRow[], n: number, minScore?: number): number[] {
  if (!Number.isFinite(n) || n <= 0) return [];
  return rows
    .filter(
      (row) =>
        isShortlistable(row) &&
        row.screened &&
        row.score !== null &&
        (minScore === undefined || row.score >= minScore),
    )
    .sort(compareRows)
    .slice(0, Math.floor(n))
    .map((row) => row.applicationId);
}

/** Parse the optional "min score" input: empty => undefined, otherwise a number within 0..100. */
export function parseMinScore(text: string): { value: number | undefined; error: string | null } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: undefined, error: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 100) return { value: undefined, error: "Use 0–100." };
  return { value, error: null };
}

/** Parse the "top N" input: a whole number ≥ 1. */
export function parseTopN(text: string): { value: number | undefined; error: string | null } {
  const value = Number(text.trim());
  if (text.trim() === "" || !Number.isInteger(value) || value < 1) return { value: undefined, error: "Enter 1 or more." };
  return { value, error: null };
}

/** Match score of an application: the latest screening's overall score, else the stored match score. */
export function applicationScore(application: Pick<Application, "match_score" | "screening_summary">): number | null {
  return application.screening_summary?.overall_score ?? application.match_score ?? null;
}

/**
 * The top `n` scored applications still in applied/screening (optionally scoring at least `minScore`),
 * highest score first. Unscored, rejected or already-advanced applications are never preselected.
 */
export function selectTopApplications(applications: Application[], n: number, minScore?: number): Application[] {
  if (!Number.isFinite(n) || n <= 0) return [];
  return applications
    .filter((application) => {
      const score = applicationScore(application);
      return isShortlistable(application) && score !== null && (minScore === undefined || score >= minScore);
    })
    .sort((a, b) => (applicationScore(b) ?? 0) - (applicationScore(a) ?? 0) || a.candidate_name.localeCompare(b.candidate_name))
    .slice(0, Math.floor(n));
}
