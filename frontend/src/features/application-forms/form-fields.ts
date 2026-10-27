import type { BuiltInFormField, FormField, FormFieldType } from "@/types/api";

export const FIELD_TYPE_ORDER: FormFieldType[] = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "date",
  "url",
  "select",
  "multi_select",
  "checkbox",
  "yes_no",
];

/** Friendly names shown to HR in the form builder. */
export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  short_text: "Short answer",
  long_text: "Paragraph",
  email: "Email address",
  phone: "Phone number",
  number: "Number",
  date: "Date",
  url: "Link (URL)",
  select: "Dropdown (one choice)",
  multi_select: "Checkboxes (several choices)",
  checkbox: "Single checkbox (agree / confirm)",
  yes_no: "Yes / No",
};

/** Compact names for the collapsed question rows. */
export const FIELD_TYPE_SHORT_LABELS: Record<FormFieldType, string> = {
  short_text: "Short answer",
  long_text: "Paragraph",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  url: "Link",
  select: "Dropdown",
  multi_select: "Checkboxes",
  checkbox: "Checkbox",
  yes_no: "Yes / No",
};

/** Server-side maximum number of custom fields per form. */
export const MAX_CUSTOM_FIELDS = 30;

/** Server default character limits when a text field has no `max_length`. */
export const DEFAULT_TEXT_LIMITS = { short_text: 200, long_text: 5000 } as const;

export function isChoiceType(type: FormFieldType): type is "select" | "multi_select" {
  return type === "select" || type === "multi_select";
}

export function isTextType(type: FormFieldType): type is "short_text" | "long_text" {
  return type === "short_text" || type === "long_text";
}

/** Types that can be scored as a screening question (mirrors the backend). */
export type ScreeningFieldType = "yes_no" | "select" | "number" | "checkbox";

export const SCREENING_FIELD_TYPES: ScreeningFieldType[] = ["yes_no", "select", "number", "checkbox"];

export function isScreeningType(type: FormFieldType): type is ScreeningFieldType {
  return (SCREENING_FIELD_TYPES as FormFieldType[]).includes(type);
}

/** Types whose input shows a placeholder. */
export function supportsPlaceholder(type: FormFieldType): boolean {
  return !isChoiceType(type) && type !== "checkbox" && type !== "yes_no" && type !== "date";
}

/** Built-in contact fields (not the CV upload) as regular field definitions for rendering and validation. */
export function builtInContactFields(builtIns: BuiltInFormField[]): FormField[] {
  return builtIns
    .filter(
      (field): field is BuiltInFormField & { type: Exclude<BuiltInFormField["type"], "file"> } => field.type !== "file",
    )
    .map((field) => ({
      id: field.id,
      label: field.label,
      type: field.type,
      required: true,
      help_text: null,
      placeholder: null,
      options: [],
      max_length: null,
    }));
}

/** Fallback when the API omits built-ins (they are always present on the server). */
export const DEFAULT_BUILT_IN_FIELDS: BuiltInFormField[] = [
  { id: "full_name", label: "Full name", type: "short_text", required: true, built_in: true },
  { id: "email", label: "Email", type: "email", required: true, built_in: true },
  { id: "phone", label: "Phone number", type: "phone", required: true, built_in: true },
  { id: "cv", label: "CV (PDF or DOCX, max 10 MB)", type: "file", required: true, built_in: true },
];

export function withBuiltInFallback(builtIns: BuiltInFormField[]): BuiltInFormField[] {
  return builtIns.length > 0 ? builtIns : DEFAULT_BUILT_IN_FIELDS;
}
