import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  AtSign,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  Hash,
  Link,
  ListChecks,
  Phone,
  Plus,
  SquareCheck,
  SquareChevronDown,
  ToggleLeft,
  Trash2,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Badge, Button, FormField, Input, Select, Switch } from "@/components/ui";
import {
  DEFAULT_TEXT_LIMITS,
  FIELD_TYPE_LABELS,
  FIELD_TYPE_ORDER,
  isChoiceType,
  isScreeningType,
  isTextType,
  supportsPlaceholder,
} from "@/features/application-forms/form-fields";
import type { FormFieldType } from "@/types/api";
import { cn } from "@/utils/cn";
import { AnswerPreview } from "./AnswerPreview";
import { emptyScreening, MAX_LENGTH_LIMIT, type BuilderValues } from "./builder-form";

const TYPE_OPTIONS = FIELD_TYPE_ORDER.map((type) => ({ value: type, label: FIELD_TYPE_LABELS[type] }));

const TYPE_ICONS: Record<FormFieldType, LucideIcon> = {
  short_text: Type,
  long_text: AlignLeft,
  email: AtSign,
  phone: Phone,
  number: Hash,
  date: Calendar,
  url: Link,
  select: SquareChevronDown,
  multi_select: ListChecks,
  checkbox: SquareCheck,
  yes_no: ToggleLeft,
};

function isFieldType(value: string): value is FormFieldType {
  return (FIELD_TYPE_ORDER as string[]).includes(value);
}

function ErrorText({ message }: { message: string | undefined }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs font-medium text-rose-600" role="alert">
      {message}
    </p>
  );
}

export interface QuestionCardProps {
  index: number;
  count: number;
  active: boolean;
  onActivate: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onDuplicate: (index: number) => void;
}

/**
 * One custom question in the Google-Forms style: inactive cards look like the applicant's form;
 * clicking one turns it into the editor.
 */
export function QuestionCard(props: QuestionCardProps) {
  const {
    formState: { errors },
  } = useFormContext<BuilderValues>();
  const { index, active } = props;
  const hasError = Boolean(errors.fields?.[index]);
  // One stable <li> per question, so activating a card keeps its DOM node.
  return (
    <li
      data-testid={`custom-field-${index}`}
      data-question-index={index}
      className={cn(
        "relative rounded-xl border bg-white transition-colors",
        active ? "border-l-[6px] shadow-md" : "shadow-xs",
        active && (hasError ? "border-rose-300 border-l-rose-500" : "border-slate-200 border-l-indigo-600"),
        !active && (hasError ? "border-rose-300" : "border-slate-200 hover:border-slate-300"),
      )}
    >
      {active ? <ActiveCard {...props} /> : <InactiveCard {...props} />}
    </li>
  );
}

function InactiveCard({ index, onActivate }: QuestionCardProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext<BuilderValues>();
  const field = useWatch({ control, name: `fields.${index}` });
  const hasError = Boolean(errors.fields?.[index]);
  const title = field.label.trim() || "Untitled question";
  const screening = field.screening.enabled && isScreeningType(field.type);

  return (
    <div className="p-4 sm:p-6">
      {/* Covers the card: clicking anywhere (or Enter) opens the editor. */}
      <button
        type="button"
        onClick={onActivate}
        aria-label={`Edit question ${index + 1}: ${title}`}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
      />
      <div className="pointer-events-none">
        <div className="flex items-start justify-between gap-3">
          <p className={cn("text-[15px] font-medium", field.label.trim() ? "text-slate-900" : "text-slate-400")}>
            {title}
            {field.required ? (
              <span className="ml-0.5 text-rose-600" aria-label="required">
                *
              </span>
            ) : null}
          </p>
          {screening ? (
            <span className="flex shrink-0 flex-wrap justify-end gap-1">
              <Badge tone="primary" size="sm">
                Screening
              </Badge>
              {field.screening.knockout ? (
                <Badge tone="warning" size="sm">
                  Must-have
                </Badge>
              ) : null}
            </span>
          ) : null}
        </div>
        {field.help_text.trim() ? <p className="mt-1 text-xs text-slate-500">{field.help_text}</p> : null}
        <div className="mt-4">
          <AnswerPreview
            type={field.type}
            options={field.options.map((option) => option.value.trim())}
            placeholder={field.placeholder}
          />
        </div>
        {hasError ? (
          <p className="mt-3 text-xs font-medium text-rose-600">This question needs attention.</p>
        ) : null}
      </div>
    </div>
  );
}

function ActiveCard({ index, count, onMove, onRemove, onDuplicate }: QuestionCardProps) {
  const {
    register,
    control,
    trigger,
    getValues,
    setValue,
    formState: { errors, isSubmitted },
  } = useFormContext<BuilderValues>();
  const baseId = useId();
  const fieldErrors = errors.fields?.[index];
  const screeningErrors = fieldErrors?.screening;
  const [type, label, screeningEnabled, accepted, expected] = useWatch({
    control,
    name: [
      `fields.${index}.type`,
      `fields.${index}.label`,
      `fields.${index}.screening.enabled`,
      `fields.${index}.screening.accepted`,
      `fields.${index}.screening.expected`,
    ],
  });
  const options = useFieldArray({ control, name: `fields.${index}.options`, keyName: "optionKey" });
  const optionsError = fieldErrors?.options?.root?.message ?? fieldErrors?.options?.message;
  const acceptedError = screeningErrors?.accepted?.message ?? screeningErrors?.accepted?.root?.message;
  const expectedError = screeningErrors?.expected?.message;
  const scorable = isScreeningType(type);
  const screening = scorable && screeningEnabled;
  const name = label?.trim() ? `“${label.trim()}”` : `question ${index + 1}`;
  const TypeIcon = TYPE_ICONS[type] ?? Type;

  const [moreOpen, setMoreOpen] = useState(() => {
    const field = getValues(`fields.${index}`);
    return Boolean(field.help_text.trim() || field.placeholder.trim() || field.max_length.trim());
  });
  const extrasError = Boolean(fieldErrors?.help_text || fieldErrors?.placeholder || fieldErrors?.max_length);
  const showMore = moreOpen || extrasError;

  // The "at least two options" rule sits on the list, so re-check it whenever an option changes.
  const revalidateOptions = () => {
    if (optionsError) void trigger(`fields.${index}.options`);
  };
  // Keep the dropdown's accepted answers in sync when an option is renamed or removed.
  const updateAccepted = (previous: string, next: string | null) => {
    const old = previous.trim();
    const current = getValues(`fields.${index}.screening.accepted`);
    if (!old || !current.includes(old)) return;
    const replaced = current.filter((value) => value !== old);
    const renamed = next?.trim();
    // Another option may still carry the old text; then it stays accepted.
    const stillThere = getValues(`fields.${index}.options`).some((option) => option.value.trim() === old);
    const result = stillThere ? current : renamed ? [...replaced, renamed] : replaced;
    setValue(`fields.${index}.screening.accepted`, Array.from(new Set(result)), { shouldDirty: true });
  };
  const toggleAccepted = (option: string) => {
    const value = option.trim();
    if (!value) return;
    const current = accepted ?? [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setValue(`fields.${index}.screening.accepted`, next, { shouldDirty: true, shouldValidate: isSubmitted });
  };
  const chooseExpected = (value: "yes" | "no") =>
    setValue(`fields.${index}.screening.expected`, value, { shouldDirty: true, shouldValidate: isSubmitted });

  return (
    <fieldset className="min-w-0">
        <legend className="sr-only">Question {index + 1}</legend>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <input
                aria-label="Question"
                placeholder="Question"
                aria-invalid={fieldErrors?.label ? true : undefined}
                className="w-full rounded-t-md border-0 border-b-2 border-slate-300 bg-slate-100 px-3 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:text-slate-600 aria-[invalid=true]:border-rose-500"
                {...register(`fields.${index}.label`)}
              />
              <ErrorText message={fieldErrors?.label?.message} />
            </div>
            <div className="flex items-center gap-2 sm:w-60">
              <TypeIcon className="size-4 shrink-0 text-slate-500" aria-hidden />
              <Controller
                control={control}
                name={`fields.${index}.type`}
                render={({ field }) => (
                  <Select
                    aria-label="Answer type"
                    name={field.name}
                    ref={field.ref}
                    value={field.value}
                    onBlur={field.onBlur}
                    disabled={field.disabled}
                    options={TYPE_OPTIONS}
                    wrapperClassName="flex-1"
                    onChange={(event) => {
                      const next = event.target.value;
                      if (!isFieldType(next) || next === field.value) return;
                      field.onChange(next);
                      // Expected answers are type-specific, so a new type starts without a rule.
                      setValue(`fields.${index}.screening`, emptyScreening(), { shouldDirty: true });
                      // Choice questions start with two empty options to fill in.
                      if (isChoiceType(next) && options.fields.length < 2) {
                        options.append(
                          Array.from({ length: 2 - options.fields.length }, () => ({ value: "" })),
                          { shouldFocus: false },
                        );
                      }
                    }}
                  />
                )}
              />
            </div>
          </div>

          {isChoiceType(type) ? (
            <div>
              <ul className="space-y-1" aria-label="Options" aria-invalid={optionsError || acceptedError ? true : undefined}>
                {options.fields.map((option, optionIndex) => (
                  <OptionRow
                    key={option.optionKey}
                    index={index}
                    optionIndex={optionIndex}
                    type={type}
                    invalid={Boolean(optionsError)}
                    acceptable={screening && type === "select"}
                    accepted={accepted ?? []}
                    onToggleAccepted={toggleAccepted}
                    onRename={updateAccepted}
                    onAfterChange={revalidateOptions}
                    onRemove={() => {
                      const removed = getValues(`fields.${index}.options.${optionIndex}.value`);
                      options.remove(optionIndex);
                      updateAccepted(removed, null);
                      revalidateOptions();
                    }}
                  />
                ))}
              </ul>
              <ErrorText message={optionsError} />
              <button
                type="button"
                onClick={() =>
                  options.append({ value: "" }, { focusName: `fields.${index}.options.${options.fields.length}.value` })
                }
                className="mt-1 flex items-center gap-2.5 rounded-md px-1 py-1.5 text-sm text-slate-500 hover:text-indigo-700"
              >
                <Plus className="size-4" aria-hidden />
                Add option
              </button>
            </div>
          ) : type === "yes_no" ? (
            <ul className="space-y-1" aria-label="Options" aria-invalid={expectedError ? true : undefined}>
              {(["yes", "no"] as const).map((value) => {
                const text = value === "yes" ? "Yes" : "No";
                const isExpected = expected === value;
                return (
                  <li
                    key={value}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-1 py-1.5 text-sm text-slate-700",
                      screening && isExpected && "bg-emerald-50",
                    )}
                  >
                    <span className="size-4 shrink-0 rounded-full border-2 border-slate-300" aria-hidden />
                    <span className="flex-1">{text}</span>
                    {screening ? (
                      <AcceptButton label={text} accepted={isExpected} onClick={() => chooseExpected(value)} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <AnswerPreview type={type} />
          )}

          {screening ? (
            <div
              role="group"
              aria-labelledby={`${baseId}-expected`}
              className="space-y-3 rounded-lg border border-emerald-100 bg-emerald-50/40 p-3"
            >
              <p id={`${baseId}-expected`} className="text-sm font-medium text-slate-800">
                Expected answer
              </p>
              {type === "yes_no" ? (
                <>
                  <p className="text-xs text-slate-500">Click ✓ next to the expected answer.</p>
                  <ErrorText message={expectedError} />
                </>
              ) : null}
              {type === "select" ? (
                <>
                  <p className="text-xs text-slate-500">Click ✓ next to each accepted answer.</p>
                  <ErrorText message={acceptedError} />
                </>
              ) : null}
              {type === "number" ? (
                <div className="grid grid-cols-2 gap-3">
                  <FormField label="Minimum" htmlFor={`${baseId}-min`} error={screeningErrors?.min?.message}>
                    <Input
                      id={`${baseId}-min`}
                      type="number"
                      inputMode="decimal"
                      aria-invalid={screeningErrors?.min ? true : undefined}
                      {...register(`fields.${index}.screening.min`, { deps: [`fields.${index}.screening.max`] })}
                    />
                  </FormField>
                  <FormField label="Maximum" htmlFor={`${baseId}-max`} error={screeningErrors?.max?.message}>
                    <Input
                      id={`${baseId}-max`}
                      type="number"
                      inputMode="decimal"
                      aria-invalid={screeningErrors?.max ? true : undefined}
                      {...register(`fields.${index}.screening.max`, { deps: [`fields.${index}.screening.min`] })}
                    />
                  </FormField>
                </div>
              ) : null}
              {type === "checkbox" ? <p className="text-sm text-slate-700">Must be ticked.</p> : null}
              <Controller
                control={control}
                name={`fields.${index}.screening.knockout`}
                render={({ field }) => (
                  <Switch label="Must-have (flag if not met)" checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
            </div>
          ) : null}

          <div>
            <button
              type="button"
              aria-expanded={showMore}
              onClick={() => setMoreOpen((value) => !value)}
              disabled={extrasError}
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900 disabled:cursor-default"
            >
              <ChevronDown className={cn("size-4 transition-transform", showMore ? "rotate-0" : "-rotate-90")} aria-hidden />
              More options
            </button>
            {showMore ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <FormField label="Help text" htmlFor={`${baseId}-help`} error={fieldErrors?.help_text?.message}>
                  <Input
                    id={`${baseId}-help`}
                    placeholder="Shown under the question"
                    {...register(`fields.${index}.help_text`)}
                  />
                </FormField>
                {supportsPlaceholder(type) ? (
                  <FormField label="Placeholder" htmlFor={`${baseId}-placeholder`} error={fieldErrors?.placeholder?.message}>
                    <Input id={`${baseId}-placeholder`} {...register(`fields.${index}.placeholder`)} />
                  </FormField>
                ) : null}
                {isTextType(type) ? (
                  <FormField label="Max. characters" htmlFor={`${baseId}-maxlen`} error={fieldErrors?.max_length?.message}>
                    <Input
                      id={`${baseId}-maxlen`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_LENGTH_LIMIT}
                      placeholder={`${DEFAULT_TEXT_LIMITS[type]}`}
                      aria-invalid={fieldErrors?.max_length ? true : undefined}
                      {...register(`fields.${index}.max_length`)}
                    />
                  </FormField>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2 sm:px-4">
          {scorable ? (
            <Controller
              control={control}
              name={`fields.${index}.screening.enabled`}
              render={({ field }) => (
                <Switch
                  label="Screening"
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked);
                    if (isSubmitted) void trigger(`fields.${index}`);
                  }}
                />
              )}
            />
          ) : null}
          <div className="ml-auto flex items-center gap-0.5">
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onMove(index, index - 1)}
                disabled={index === 0}
                aria-label={`Move ${name} up`}
                title="Move up"
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onMove(index, index + 1)}
                disabled={index === count - 1}
                aria-label={`Move ${name} down`}
                title="Move down"
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDuplicate(index)}
                aria-label={`Duplicate ${name}`}
                title="Duplicate"
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onRemove(index)}
                aria-label={`Remove ${name}`}
                title="Delete"
                className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              >
                <Trash2 />
              </Button>
              <span className="mx-2 h-6 w-px bg-slate-200" aria-hidden />
            </>
            <Controller
              control={control}
              name={`fields.${index}.required`}
              render={({ field }) => (
                <Switch label="Required" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>
        </div>
    </fieldset>
  );
}

/** Green check next to an option: marks it as an accepted / expected screening answer. */
function AcceptButton({ label, accepted, onClick, disabled }: { label: string; accepted: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={accepted}
      aria-label={`Accept “${label}”`}
      title={accepted ? "Accepted answer" : "Mark as accepted"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 disabled:opacity-40",
        accepted ? "bg-emerald-100 text-emerald-700" : "text-slate-300 hover:bg-slate-100 hover:text-slate-500",
      )}
    >
      <Check className="size-4" aria-hidden />
    </button>
  );
}

/** One editable option: glyph, borderless input, optional accept check and ×. */
function OptionRow({
  index,
  optionIndex,
  type,
  invalid,
  acceptable,
  accepted,
  onToggleAccepted,
  onRename,
  onAfterChange,
  onRemove,
}: {
  index: number;
  optionIndex: number;
  type: "select" | "multi_select";
  invalid: boolean;
  acceptable: boolean;
  accepted: string[];
  onToggleAccepted: (option: string) => void;
  onRename: (previous: string, next: string) => void;
  onAfterChange: () => void;
  onRemove: () => void;
}) {
  const { register, getValues, control } = useFormContext<BuilderValues>();
  const name = `fields.${index}.options.${optionIndex}.value` as const;
  const value = useWatch({ control, name }) ?? "";
  const registration = register(name);
  const trimmed = value.trim();
  const isAccepted = acceptable && trimmed !== "" && accepted.includes(trimmed);

  return (
    <li className={cn("flex items-center gap-2.5 rounded-md px-1", isAccepted && "bg-emerald-50")}>
      {type === "select" ? (
        <span className="w-4 shrink-0 text-right text-xs tabular-nums text-slate-400" aria-hidden>
          {optionIndex + 1}.
        </span>
      ) : (
        <span className="size-4 shrink-0 rounded border-2 border-slate-300" aria-hidden />
      )}
      <input
        aria-label={`Option ${optionIndex + 1}`}
        placeholder={`Option ${optionIndex + 1}`}
        aria-invalid={invalid ? true : undefined}
        className="min-w-0 flex-1 border-0 border-b border-transparent bg-transparent py-1.5 text-sm text-slate-800 placeholder:text-slate-400 hover:border-slate-200 focus:border-indigo-600 focus:outline-none aria-[invalid=true]:border-rose-400"
        {...registration}
        onChange={async (event) => {
          const previous = getValues(name);
          await registration.onChange(event);
          onRename(previous, event.target.value);
          onAfterChange();
        }}
      />
      {acceptable ? (
        <AcceptButton
          label={trimmed || `Option ${optionIndex + 1}`}
          accepted={isAccepted}
          disabled={trimmed === ""}
          onClick={() => onToggleAccepted(trimmed)}
        />
      ) : null}
      <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove option ${optionIndex + 1}`}>
        <X />
      </Button>
    </li>
  );
}
