import type { HTMLInputAutoCompleteAttribute, ReactNode } from "react";
import { Checkbox, Input, Select, Textarea } from "@/components/ui";
import type { FormField } from "@/types/api";
import { cn } from "@/utils/cn";
import type { AnswerValue } from "../answer-schema";
import { DEFAULT_TEXT_LIMITS } from "../form-fields";

const AUTOCOMPLETE: Record<string, HTMLInputAutoCompleteAttribute> = {
  full_name: "name",
  email: "email",
  phone: "tel",
};

export interface AnswerFieldProps {
  field: FormField;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  error?: string;
  disabled?: boolean;
  /** Prefix for element ids so the same form can render twice (e.g. builder preview). */
  idPrefix: string;
}

const labelClass = "text-[15px] font-medium text-slate-800";
const choiceRowClass =
  "flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-3 text-[15px] text-slate-800 transition-colors hover:bg-slate-50 has-[:checked]:border-indigo-300 has-[:checked]:bg-indigo-50/50";

function RequiredMark({ required }: { required: boolean }) {
  return required ? (
    <span className="ml-0.5 text-rose-600" aria-hidden>
      *
    </span>
  ) : (
    <span className="ml-1.5 text-xs font-normal text-slate-400">(optional)</span>
  );
}

function FieldMessages({
  helpId,
  errorId,
  help,
  error,
}: {
  helpId: string;
  errorId: string;
  help: string | null;
  error?: string;
}) {
  return (
    <>
      {help ? (
        <p id={helpId} className="text-sm text-slate-500">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

/**
 * Renders one applicant-facing form field by type. Shared by the public apply page and the
 * builder's live preview so HR sees exactly what applicants see.
 */
export function AnswerField({ field, value, onChange, error, disabled, idPrefix }: AnswerFieldProps) {
  const id = `${idPrefix}-${field.id}`;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [field.help_text ? helpId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const invalid = error ? true : undefined;
  const text = typeof value === "string" ? value : "";
  const placeholder = field.placeholder ?? undefined;
  const messages = <FieldMessages helpId={helpId} errorId={errorId} help={field.help_text} error={error} />;

  let wrapper: ReactNode;

  if (field.type === "multi_select" || field.type === "yes_no") {
    const selected = Array.isArray(value) ? value : [];
    const choices =
      field.type === "yes_no"
        ? [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]
        : field.options.map((option) => ({ value: option, label: option }));
    wrapper = (
      <fieldset aria-describedby={describedBy} aria-invalid={invalid} className="min-w-0 space-y-2">
        <legend className={cn(labelClass, "mb-2")}>
          {field.label}
          <RequiredMark required={field.required} />
        </legend>
        <div className={cn("grid gap-2", field.type === "yes_no" && "grid-cols-2 sm:max-w-xs")}>
          {choices.map((choice, index) => {
            const choiceId = `${id}-${index}`;
            const checked = field.type === "yes_no" ? text === choice.value : selected.includes(choice.value);
            return (
              <label key={choice.value} htmlFor={choiceId} className={choiceRowClass}>
                {field.type === "yes_no" ? (
                  <input
                    id={choiceId}
                    type="radio"
                    name={id}
                    value={choice.value}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => onChange(choice.value)}
                    className="mt-0.5 size-4 shrink-0 accent-indigo-700"
                  />
                ) : (
                  <Checkbox
                    id={choiceId}
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? field.options.filter((option) => option === choice.value || selected.includes(option))
                          : selected.filter((item) => item !== choice.value),
                      )
                    }
                    className="mt-0.5"
                  />
                )}
                <span className="min-w-0 break-words">{choice.label}</span>
              </label>
            );
          })}
        </div>
        {messages}
      </fieldset>
    );
  } else if (field.type === "checkbox") {
    wrapper = (
      <div className="space-y-2">
        <label htmlFor={id} className={cn(choiceRowClass, "items-start")}>
          <Checkbox
            id={id}
            checked={value === true}
            disabled={disabled}
            aria-invalid={invalid}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.checked)}
            className="mt-0.5"
          />
          <span className="min-w-0 break-words font-medium">
            {field.label}
            <RequiredMark required={field.required} />
          </span>
        </label>
        {messages}
      </div>
    );
  } else {
    const common = {
      id,
      disabled,
      "aria-invalid": invalid,
      "aria-describedby": describedBy,
      "aria-required": field.required || undefined,
    };
    let control: ReactNode;
    if (field.type === "long_text") {
      control = (
        <Textarea
          {...common}
          rows={5}
          className="text-[15px]"
          value={text}
          placeholder={placeholder}
          maxLength={field.max_length ?? DEFAULT_TEXT_LIMITS.long_text}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    } else if (field.type === "select") {
      control = (
        <Select
          {...common}
          className="h-11 text-[15px]"
          value={text}
          placeholder="Choose an option"
          options={field.options.map((option) => ({ value: option, label: option }))}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    } else {
      const inputType = {
        short_text: "text",
        email: "email",
        phone: "tel",
        number: "number",
        date: "date",
        url: "url",
      }[field.type];
      control = (
        <Input
          {...common}
          type={inputType}
          className="h-11 text-[15px]"
          value={text}
          placeholder={placeholder ?? (field.type === "url" ? "https://" : undefined)}
          autoComplete={
            AUTOCOMPLETE[field.id] ??
            (field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "url" ? "url" : "off")
          }
          inputMode={field.type === "number" ? "decimal" : undefined}
          step={field.type === "number" ? "any" : undefined}
          maxLength={field.type === "short_text" ? (field.max_length ?? DEFAULT_TEXT_LIMITS.short_text) : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      );
    }
    wrapper = (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className={labelClass}>
          {field.label}
          <RequiredMark required={field.required} />
        </label>
        {control}
        {messages}
      </div>
    );
  }

  return (
    <div data-field-id={field.id} className="scroll-mt-24">
      {wrapper}
    </div>
  );
}
