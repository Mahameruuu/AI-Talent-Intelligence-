import { z } from "zod";
import { ApiError, getErrorMessage } from "@/services/api-client";
import type { AnswerErrors } from "@/features/application-forms/answer-schema";

/** Why a form isn't accepting applications, as shown to the applicant. */
export type ClosedReason = "not_yet_open" | "deadline_passed" | "closed";

export function toClosedReason(reason: string | null | undefined): ClosedReason {
  return reason === "not_yet_open" || reason === "deadline_passed" ? reason : "closed";
}

/** What the page should do after a failed submit. */
export type SubmitFailure =
  | { kind: "fields"; errors: AnswerErrors; message: string }
  | { kind: "consent"; message: string }
  | { kind: "closed"; reason: ClosedReason }
  | { kind: "already_applied"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "not_found" }
  | { kind: "other"; message: string };

const fieldErrorsSchema = z.object({ fields: z.record(z.string(), z.string()) });

/** `error.details.fields` ({field_id: message}) from a 400/413 response, if present. */
export function readFieldErrors(details: unknown): AnswerErrors | null {
  const parsed = fieldErrorsSchema.safeParse(details);
  if (!parsed.success || Object.keys(parsed.data.fields).length === 0) return null;
  return parsed.data.fields;
}

export function classifySubmitError(error: unknown): SubmitFailure {
  if (!(error instanceof ApiError)) {
    return { kind: "other", message: getErrorMessage(error, "Something went wrong. Please try again.") };
  }
  const fieldErrors = readFieldErrors(error.details);
  if (fieldErrors) return { kind: "fields", errors: fieldErrors, message: error.message };
  if (error.code === "consent_required") return { kind: "consent", message: error.message };
  if (error.status === 410 || error.code === "form_closed") {
    const reason: ClosedReason =
      error.code === "not_yet_open" || error.code === "deadline_passed" ? error.code : "closed";
    return { kind: "closed", reason };
  }
  if (error.status === 409 || error.code === "already_applied")
    return { kind: "already_applied", message: error.message };
  if (error.status === 429 || error.code === "rate_limited") return { kind: "rate_limited", message: error.message };
  if (error.status === 413 || error.code === "file_too_large") {
    return { kind: "fields", errors: { cv: error.message }, message: error.message };
  }
  if (error.status === 404) return { kind: "not_found" };
  if (error.isNetworkError) {
    return {
      kind: "other",
      message:
        "We couldn't reach the server. Check your internet connection and try again — your answers are still here.",
    };
  }
  return { kind: "other", message: error.message };
}
