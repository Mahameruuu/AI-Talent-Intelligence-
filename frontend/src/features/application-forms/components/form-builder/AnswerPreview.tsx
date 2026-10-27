import { Upload } from "lucide-react";
import type { FormFieldType } from "@/types/api";
import { cn } from "@/utils/cn";

const UNDERLINE =
  "w-full border-0 border-b border-dotted border-slate-300 bg-transparent px-0 py-1.5 text-sm text-slate-500 placeholder:text-slate-400 disabled:cursor-default";

const TEXT_PLACEHOLDERS: Partial<Record<FormFieldType, string>> = {
  short_text: "Short answer text",
  long_text: "Long answer text",
  email: "Email address",
  phone: "Phone number",
  number: "Number",
  url: "Link (https://…)",
};

export interface AnswerPreviewProps {
  type: FormFieldType;
  /** Shown next to a single checkbox (its label). */
  label?: string;
  options?: string[];
  placeholder?: string | null;
}

/** Disabled, applicant-style rendering of an answer control (Google Forms "inactive card" look). */
export function AnswerPreview({ type, label, options = [], placeholder }: AnswerPreviewProps) {
  if (type === "yes_no" || type === "select" || type === "multi_select") {
    const choices = type === "yes_no" ? ["Yes", "No"] : options.length > 0 ? options : ["Option 1"];
    return (
      <ul className="space-y-2">
        {choices.map((choice, index) => (
          <li key={`${choice}-${index}`} className="flex items-center gap-2.5 text-sm text-slate-700">
            {type === "select" ? (
              <span className="w-4 text-right text-xs tabular-nums text-slate-400">{index + 1}.</span>
            ) : (
              <input
                type={type === "multi_select" ? "checkbox" : "radio"}
                disabled
                aria-label={choice}
                className="size-4 accent-slate-400"
              />
            )}
            <span className={cn(choice ? "" : "text-slate-400")}>{choice || `Option ${index + 1}`}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (type === "checkbox") {
    return (
      <label className="flex items-center gap-2.5 text-sm text-slate-700">
        <input type="checkbox" disabled className="size-4 accent-slate-400" />
        {label || "I confirm"}
      </label>
    );
  }
  if (type === "date") {
    return <input type="date" disabled aria-label="Date" className={cn(UNDERLINE, "max-w-48")} />;
  }
  if (type === "long_text") {
    return (
      <textarea
        disabled
        rows={2}
        aria-label="Answer"
        placeholder={placeholder || TEXT_PLACEHOLDERS.long_text}
        className={cn(UNDERLINE, "resize-none")}
      />
    );
  }
  return (
    <input
      type={type === "number" ? "number" : "text"}
      disabled
      aria-label="Answer"
      placeholder={placeholder || TEXT_PLACEHOLDERS[type]}
      className={cn(UNDERLINE, "sm:max-w-sm")}
    />
  );
}

/** Disabled CV upload box for the "Applicant details" card. */
export function FilePreview() {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
      <Upload className="size-4 text-slate-400" aria-hidden />
      Upload PDF or DOCX
    </div>
  );
}
