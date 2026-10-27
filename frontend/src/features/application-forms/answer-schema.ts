// Client-side validation for applicant answers, built dynamically from the form's field
// definitions. Rules and messages mirror the backend (`app/services/forms.py`) so applicants
// see the same feedback before and after submitting.
import { z, type ZodType } from "zod";
import type { FormAnswerValue, FormField } from "@/types/api";
import { DEFAULT_TEXT_LIMITS } from "./form-fields";

/** Value held by an input while the applicant fills in the form. */
export type AnswerValue = string | string[] | boolean;
export type AnswerValues = Record<string, AnswerValue>;
export type AnswerErrors = Record<string, string>;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/;
const PHONE_RE = /^\+?[\d\s().-]{8,20}$/;
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const NUMBER_RE = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const REQUIRED_MESSAGE = "This field is required.";

export function emptyAnswer(field: Pick<FormField, "type">): AnswerValue {
  if (field.type === "multi_select") return [];
  if (field.type === "checkbox") return false;
  return "";
}

export function initialAnswers(fields: Pick<FormField, "id" | "type">[]): AnswerValues {
  return Object.fromEntries(fields.map((field) => [field.id, emptyAnswer(field)]));
}

function isEmpty(field: Pick<FormField, "type">, value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return field.type === "checkbox" && value === false;
}

function isValidDate(text: string): boolean {
  const match = DATE_RE.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseNumber(text: string): number | null {
  const normalized = text.replace(/,/g, "").trim();
  if (!NUMBER_RE.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/** Returns the user-facing error for one answer, or null when it is valid. */
export function validateAnswer(field: FormField, value: unknown): string | null {
  if (isEmpty(field, value)) return field.required ? REQUIRED_MESSAGE : null;
  const text = typeof value === "string" ? value.trim() : "";

  switch (field.type) {
    case "short_text":
    case "long_text": {
      const limit = field.max_length ?? DEFAULT_TEXT_LIMITS[field.type];
      return text.length > limit ? `Maximum ${limit} characters.` : null;
    }
    case "email":
      return !EMAIL_RE.test(text) || text.length > 255 ? "Enter a valid email address." : null;
    case "phone": {
      const digits = text.replace(/\D/g, "").length;
      return !PHONE_RE.test(text) || digits < 8 || digits > 15 ? "Enter a valid phone number." : null;
    }
    case "number":
      return parseNumber(text) === null ? "Enter a number." : null;
    case "date":
      return isValidDate(text) ? null : "Enter a valid date (YYYY-MM-DD).";
    case "url":
      return !URL_RE.test(text) || text.length > 500 ? "Enter a valid URL starting with http:// or https://." : null;
    case "select":
      return typeof value === "string" && field.options.includes(value) ? null : "Choose one of the options.";
    case "multi_select": {
      const values = Array.isArray(value) ? value : [value];
      return values.every((item) => typeof item === "string" && field.options.includes(item))
        ? null
        : "Choose from the listed options.";
    }
    case "checkbox":
      return typeof value === "boolean" ? null : REQUIRED_MESSAGE;
    case "yes_no":
      return value === "yes" || value === "no" ? null : "Answer yes or no.";
  }
}

/** Normalise a valid answer to the JSON value the API expects. Empty optional answers become null. */
export function cleanAnswer(field: FormField, value: unknown): FormAnswerValue {
  if (isEmpty(field, value)) return field.type === "checkbox" ? false : null;
  const text = typeof value === "string" ? value.trim() : "";
  switch (field.type) {
    case "email":
      return text.toLowerCase();
    case "number":
      return parseNumber(text);
    case "multi_select":
      return Array.isArray(value)
        ? Array.from(new Set(value.filter((item): item is string => typeof item === "string")))
        : [];
    case "checkbox":
      return value === true;
    case "select":
    case "yes_no":
      return typeof value === "string" ? value : null;
    default:
      return text;
  }
}

/** Zod schema for the answers object: one key per field id, cleaned to API values on success. */
export function buildAnswersSchema(
  fields: FormField[],
): ZodType<Record<string, FormAnswerValue>, Record<string, unknown>> {
  const shape: Record<string, ZodType<FormAnswerValue, unknown>> = {};
  for (const field of fields) {
    shape[field.id] = z
      .unknown()
      .superRefine((value, ctx) => {
        const message = validateAnswer(field, value);
        if (message) ctx.addIssue({ code: "custom", message });
      })
      .transform((value) => cleanAnswer(field, value));
  }
  return z.object(shape);
}

export type AnswersValidation =
  { success: true; data: Record<string, FormAnswerValue> } | { success: false; errors: AnswerErrors };

/** Validate all answers; errors are keyed by field id (first message per field). */
export function validateAnswers(fields: FormField[], values: AnswerValues): AnswersValidation {
  const result = buildAnswersSchema(fields).safeParse(values);
  if (result.success) return { success: true, data: result.data };
  const errors: AnswerErrors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !(key in errors)) errors[key] = issue.message;
  }
  return { success: false, errors };
}
