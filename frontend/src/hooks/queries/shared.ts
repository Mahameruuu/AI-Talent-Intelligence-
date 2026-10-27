import type { DocumentStatus, InterviewEvaluation } from "@/types/api";

export const POLL_INTERVAL_MS = 1500;

export function isDocumentProcessing(status: DocumentStatus | null | undefined): boolean {
  return status === "queued" || status === "processing";
}

export function isEvaluationRunning(status: InterviewEvaluation["status"] | null | undefined): boolean {
  return status === "pending" || status === "processing";
}

/** Page size used when loading every job for filter dropdowns. */
export const OPTIONS_PAGE_SIZE = 100;
