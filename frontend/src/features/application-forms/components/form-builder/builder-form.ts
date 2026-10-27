import { z } from "zod";
import {
  isChoiceType,
  isScreeningType,
  isTextType,
  MAX_CUSTOM_FIELDS,
  supportsPlaceholder,
} from "@/features/application-forms/form-fields";
import { fromDateTimeLocal, toDateTimeLocal } from "@/features/application-forms/form-status";
import { FORM_FIELD_TYPES } from "@/services/schemas";
import type { ApplicationForm, ApplicationFormInput, FormField, FormFieldType, FormScreeningRule } from "@/types/api";

export interface BuilderFieldValues {
  /** Server-assigned id; "" for fields added in this session (the server assigns one on save). */
  id: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  help_text: string;
  placeholder: string;
  options: { value: string }[];
  /** Kept as text so the input can be empty; "" => server default. */
  max_length: string;
  /** Screening rule editor state; only the parts relevant to `type` are sent. */
  screening: BuilderScreeningValues;
}

export interface BuilderScreeningValues {
  enabled: boolean;
  knockout: boolean;
  /** yes_no: expected answer ("" = not chosen yet). */
  expected: "" | "yes" | "no";
  /** select: accepted option values. */
  accepted: string[];
  /** number: bounds as text so the inputs can be empty. */
  min: string;
  max: string;
}

export interface BuilderValues {
  title: string;
  intro: string;
  /** <input type="datetime-local"> value, "" => no deadline. */
  closes_at: string;
  fields: BuilderFieldValues[];
}

export const MAX_LENGTH_LIMIT = 5000;

export function cleanOptions(options: { value: string }[]): string[] {
  return Array.from(new Set(options.map((option) => option.value.trim()).filter(Boolean)));
}

export function emptyScreening(): BuilderScreeningValues {
  return { enabled: false, knockout: false, expected: "", accepted: [], min: "", max: "" };
}

/** "" => null; otherwise the parsed number (NaN when not numeric). */
function parseBound(value: string): number | null {
  const raw = value.trim().replace(",", ".");
  return raw === "" ? null : Number(raw);
}

/** Accepted answers that are still among the field's options, in option order. */
function acceptedOptions(field: Pick<BuilderFieldValues, "options" | "screening">): string[] {
  const accepted = new Set(field.screening.accepted.map((value) => value.trim()));
  return cleanOptions(field.options).filter((option) => accepted.has(option));
}

const screeningSchema = z.object({
  enabled: z.boolean(),
  knockout: z.boolean(),
  expected: z.enum(["", "yes", "no"]),
  accepted: z.array(z.string()),
  min: z.string(),
  max: z.string(),
});

const fieldSchema = z
  .object({
    id: z.string(),
    label: z.string().trim().min(1, "Give this question a label").max(200, "Keep the label under 200 characters"),
    type: z.enum(FORM_FIELD_TYPES),
    required: z.boolean(),
    help_text: z.string().max(500, "Keep the help text under 500 characters"),
    placeholder: z.string().max(200, "Keep the placeholder under 200 characters"),
    options: z.array(z.object({ value: z.string().max(200, "Keep options under 200 characters") })),
    max_length: z.string(),
    screening: screeningSchema,
  })
  .superRefine((field, ctx) => {
    validateScreening(field, ctx);
    if (isChoiceType(field.type) && cleanOptions(field.options).length < 2) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least two different options." });
    }
    const raw = field.max_length.trim();
    if (isTextType(field.type) && raw !== "") {
      const value = Number(raw);
      if (!Number.isInteger(value) || value < 1 || value > MAX_LENGTH_LIMIT) {
        ctx.addIssue({
          code: "custom",
          path: ["max_length"],
          message: `Enter a whole number from 1 to ${MAX_LENGTH_LIMIT}`,
        });
      }
    }
  });

/** Mirrors the backend's screening-rule checks so HR sees the problem next to the question. */
function validateScreening(field: BuilderFieldValues, ctx: z.RefinementCtx) {
  const rule = field.screening;
  if (!rule.enabled || !isScreeningType(field.type)) return;
  if (field.type === "yes_no" && rule.expected === "") {
    ctx.addIssue({ code: "custom", path: ["screening", "expected"], message: "Choose the expected answer." });
  }
  if (field.type === "select" && acceptedOptions(field).length === 0) {
    ctx.addIssue({ code: "custom", path: ["screening", "accepted"], message: "Mark at least one accepted answer." });
  }
  if (field.type === "number") {
    const min = parseBound(rule.min);
    const max = parseBound(rule.max);
    if (min === null && max === null) {
      ctx.addIssue({ code: "custom", path: ["screening", "min"], message: "Enter a minimum, a maximum or both." });
      return;
    }
    if (min !== null && !Number.isFinite(min)) {
      ctx.addIssue({ code: "custom", path: ["screening", "min"], message: "Enter a number." });
    }
    if (max !== null && !Number.isFinite(max)) {
      ctx.addIssue({ code: "custom", path: ["screening", "max"], message: "Enter a number." });
    }
    if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max) && max < min) {
      ctx.addIssue({
        code: "custom",
        path: ["screening", "max"],
        message: "The maximum can't be lower than the minimum.",
      });
    }
  }
}

export const builderSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "The title needs at least 2 characters")
    .max(255, "Keep the title under 255 characters"),
  intro: z.string().max(4000, "Keep the introduction under 4000 characters"),
  closes_at: z
    .string()
    .refine((value) => value.trim() === "" || fromDateTimeLocal(value) !== null, "Enter a valid date and time"),
  fields: z.array(fieldSchema).max(MAX_CUSTOM_FIELDS, `A form can have at most ${MAX_CUSTOM_FIELDS} custom questions`),
});

export function emptyField(type: FormFieldType = "short_text"): BuilderFieldValues {
  return {
    id: "",
    label: "",
    type,
    required: false,
    help_text: "",
    placeholder: "",
    options: isChoiceType(type) ? [{ value: "" }, { value: "" }] : [],
    max_length: "",
    screening: emptyScreening(),
  };
}

function toBuilderScreening(rule: FormScreeningRule | null | undefined): BuilderScreeningValues {
  if (!rule?.enabled) return emptyScreening();
  return {
    enabled: true,
    knockout: rule.knockout,
    expected: rule.expected === "yes" || rule.expected === "no" ? rule.expected : "",
    accepted: rule.accepted ?? [],
    min: rule.min === undefined || rule.min === null ? "" : String(rule.min),
    max: rule.max === undefined || rule.max === null ? "" : String(rule.max),
  };
}

export function toBuilderValues(form: ApplicationForm): BuilderValues {
  return {
    title: form.title,
    intro: form.intro ?? "",
    closes_at: toDateTimeLocal(form.closes_at),
    fields: form.fields.map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      help_text: field.help_text ?? "",
      placeholder: field.placeholder ?? "",
      options: field.options.map((value) => ({ value })),
      max_length: field.max_length === null ? "" : String(field.max_length),
      screening: toBuilderScreening(field.screening),
    })),
  };
}

/** Field definition as sent to / rendered from the API (id omitted for new fields). */
function toFieldDefinition(field: BuilderFieldValues): Omit<FormField, "id"> {
  const maxLength = field.max_length.trim();
  return {
    label: field.label.trim(),
    type: field.type,
    required: field.required,
    help_text: field.help_text.trim() || null,
    placeholder: supportsPlaceholder(field.type) ? field.placeholder.trim() || null : null,
    options: isChoiceType(field.type) ? cleanOptions(field.options) : [],
    max_length: isTextType(field.type) && maxLength !== "" ? Number(maxLength) : null,
  };
}

/**
 * The field's screening rule as the API expects it, or null when the question isn't scored.
 * Only the keys for the field's current type are sent; stale accepted options are dropped.
 */
export function toScreeningRule(field: BuilderFieldValues): FormScreeningRule | null {
  const rule = field.screening;
  if (!rule.enabled || !isScreeningType(field.type)) return null;
  const base = { enabled: true as const, knockout: rule.knockout };
  switch (field.type) {
    case "yes_no":
      return { ...base, expected: rule.expected === "no" ? "no" : "yes" };
    case "select":
      return { ...base, accepted: acceptedOptions(field) };
    case "number": {
      const min = parseBound(rule.min);
      const max = parseBound(rule.max);
      return { ...base, ...(min !== null ? { min } : {}), ...(max !== null ? { max } : {}) };
    }
    case "checkbox":
      return { ...base, expected: true };
  }
}

/** Request body for PUT /jobs/{id}/form. */
export function toFormInput(values: BuilderValues): ApplicationFormInput {
  return {
    title: values.title.trim(),
    intro: values.intro.trim() || null,
    closes_at: fromDateTimeLocal(values.closes_at),
    // The screening rule is HR-only, so it's added here and never to the preview definition.
    fields: values.fields.map((field) => ({
      ...(field.id ? { id: field.id } : {}),
      ...toFieldDefinition(field),
      screening: toScreeningRule(field),
    })),
  };
}

/**
 * Custom fields as applicants would see them, for the live preview. `keys` are stable
 * per-row keys used as ids for fields that have no server id yet.
 */
export function toPreviewFields(fields: BuilderFieldValues[] | undefined, keys: string[]): FormField[] {
  return (fields ?? []).map((field, index) => {
    const definition = toFieldDefinition(field);
    return {
      ...definition,
      id: field.id || keys[index] || `new-${index}`,
      label: definition.label || "Untitled question",
    };
  });
}

/** A copy of a question as a new field (no server id; arrays copied). */
export function duplicateField(field: BuilderFieldValues): BuilderFieldValues {
  return {
    ...field,
    id: "",
    options: field.options.map((option) => ({ value: option.value })),
    screening: { ...field.screening, accepted: [...field.screening.accepted] },
  };
}
