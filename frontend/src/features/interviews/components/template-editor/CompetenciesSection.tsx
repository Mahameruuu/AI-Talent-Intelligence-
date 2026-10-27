import { ChevronDown, Plus, Scale, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  FormField,
  Input,
  Textarea,
} from "@/components/ui";
import { cn } from "@/utils/cn";
import { pluralize } from "@/utils/format";
import { RUBRIC_SCORES, emptyCompetency, weightShare, type TemplateFormValues } from "./template-form";

const LEVEL_HINTS: Record<number, string> = { 1: "lowest", 5: "highest" };

function RubricEditor({ index }: { index: number }) {
  const {
    register,
    formState: { errors },
  } = useFormContext<TemplateFormValues>();
  const baseId = useId();
  const rubricErrors = errors.competencies?.[index]?.rubric;
  return (
    <ol className="space-y-2.5">
      {RUBRIC_SCORES.map((score, levelIndex) => {
        const fieldId = `${baseId}-level-${score}`;
        const error = rubricErrors?.[levelIndex]?.descriptor?.message;
        return (
          <li key={score} className="flex gap-3">
            <label
              htmlFor={fieldId}
              className="mt-1.5 flex w-14 shrink-0 flex-col items-center rounded-md bg-slate-100 py-1 text-center"
            >
              <span className="text-sm font-semibold tabular-nums text-slate-800">{score}</span>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">{LEVEL_HINTS[score] ?? "level"}</span>
            </label>
            <div className="min-w-0 flex-1">
              <Textarea
                id={fieldId}
                rows={2}
                className="min-h-0"
                placeholder={`What a level-${score} answer demonstrates`}
                aria-invalid={error ? true : undefined}
                aria-label={`Rubric level ${score} descriptor`}
                {...register(`competencies.${index}.rubric.${levelIndex}.descriptor`)}
              />
              {error ? (
                <p className="mt-1 text-xs font-medium text-rose-600" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function CompetencyCard({
  index,
  total,
  questionCount,
  canRemove,
  onRemove,
  onRenamed,
}: {
  index: number;
  total: number;
  questionCount: number;
  canRemove: boolean;
  onRemove: () => void;
  onRenamed: (previousName: string, nextName: string) => void;
}) {
  const {
    register,
    control,
    getValues,
    formState: { errors },
  } = useFormContext<TemplateFormValues>();
  const fieldErrors = errors.competencies?.[index];
  const weight = useWatch({ control, name: `competencies.${index}.weight` });
  const rubric = useWatch({ control, name: `competencies.${index}.rubric` });
  const describedLevels = (rubric ?? []).filter((level) => level?.descriptor?.trim()).length;
  const share = weightShare(Number(weight), total);
  const hasRubricErrors = Boolean(fieldErrors?.rubric);
  const [rubricOpen, setRubricOpen] = useState(describedLevels < RUBRIC_SCORES.length);
  // Read-only viewers can't use the toggle (it sits in a disabled fieldset), so always show the rubric.
  const showRubric = rubricOpen || hasRubricErrors;
  const nameBeforeEdit = useRef<string>("");
  const baseId = useId();
  const nameField = register(`competencies.${index}.name`);

  return (
    <li className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Competency {index + 1}</span>
          <Badge tone="primary" size="sm" title="Share of the overall interview score">
            {share > 0 ? `${Math.round(share)}% of score` : "0% of score"}
          </Badge>
          <Badge tone={questionCount > 0 ? "neutral" : "warning"} size="sm">
            {pluralize(questionCount, "question")}
          </Badge>
        </div>
        {canRemove ? (
          <Button variant="ghost" size="sm" leftIcon={<Trash2 />} onClick={onRemove} className="text-rose-700 hover:bg-rose-50 hover:text-rose-800">
            Remove
          </Button>
        ) : null}
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <FormField label="Name" htmlFor={`${baseId}-name`} required error={fieldErrors?.name?.message}>
            <Input
              id={`${baseId}-name`}
              placeholder="e.g. Problem solving"
              aria-invalid={fieldErrors?.name ? true : undefined}
              {...nameField}
              onFocus={() => {
                nameBeforeEdit.current = getValues(`competencies.${index}.name`) ?? "";
              }}
              onBlur={(event) => {
                void nameField.onBlur(event);
                const previous = nameBeforeEdit.current.trim();
                const next = event.target.value.trim();
                if (previous && next && previous !== next) onRenamed(previous, next);
              }}
            />
          </FormField>
          <FormField
            label="Weight"
            htmlFor={`${baseId}-weight`}
            required
            error={fieldErrors?.weight?.message}
            hint={share > 0 ? `Relative · ${share.toFixed(share < 10 ? 1 : 0)}% share` : "Relative weight"}
          >
            <Input
              id={`${baseId}-weight`}
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              aria-invalid={fieldErrors?.weight ? true : undefined}
              {...register(`competencies.${index}.weight`, { valueAsNumber: true })}
            />
          </FormField>
        </div>

        <FormField
          label="Description"
          htmlFor={`${baseId}-description`}
          error={fieldErrors?.description?.message}
          hint="What this competency means for the role. The AI interviewer and evaluator use it as context."
        >
          <Textarea id={`${baseId}-description`} rows={2} className="min-h-0" {...register(`competencies.${index}.description`)} />
        </FormField>

        <div className="rounded-lg border border-slate-200 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setRubricOpen((open) => !open)}
            aria-expanded={showRubric}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left enabled:hover:bg-slate-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 disabled:cursor-default"
            disabled={hasRubricErrors}
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Scale className="size-4 text-slate-400" aria-hidden />
              Scoring rubric
              <span className={cn("text-xs font-normal", describedLevels === 5 ? "text-slate-500" : "text-amber-700")}>
                {describedLevels}/5 levels described
              </span>
            </span>
            <ChevronDown
              className={cn("size-4 text-slate-400 transition-transform", showRubric ? "rotate-0" : "-rotate-90")}
              aria-hidden
            />
          </button>
          {showRubric ? (
            <div className="border-t border-slate-200 px-3 py-3">
              <p className="mb-3 text-xs text-slate-500">
                Scores are fixed from 1 (lowest) to 5 (highest). Describe the observable behaviour for each level so
                evaluations stay consistent.
              </p>
              <RubricEditor index={index} />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function CompetenciesSection() {
  const {
    control,
    getValues,
    setValue,
    formState: { errors, isSubmitted },
  } = useFormContext<TemplateFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "competencies" });
  const competencies = useWatch({ control, name: "competencies" });
  const questions = useWatch({ control, name: "questions" });
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null);

  const total = (competencies ?? []).reduce((sum, competency) => {
    const weight = Number(competency?.weight);
    return Number.isFinite(weight) && weight > 0 ? sum + weight : sum;
  }, 0);

  const questionCountFor = (index: number): number => {
    const name = competencies?.[index]?.name?.trim();
    if (!name) return 0;
    return (questions ?? []).filter((question) => question?.competency?.trim() === name).length;
  };

  const renameReferences = (previousName: string, nextName: string) => {
    getValues("questions").forEach((question, questionIndex) => {
      if (question.competency.trim() === previousName) {
        setValue(`questions.${questionIndex}.competency`, nextName, { shouldDirty: true, shouldValidate: isSubmitted });
      }
    });
  };

  const arrayError = errors.competencies?.root?.message ?? errors.competencies?.message;
  const removalName = pendingRemoval !== null ? competencies?.[pendingRemoval]?.name?.trim() : "";
  const removalQuestions = pendingRemoval !== null ? questionCountFor(pendingRemoval) : 0;

  return (
    <Card>
      <CardHeader
        title="Competencies & rubric"
        description="What the interview assesses. Weights are relative: each competency's share of the overall score is its weight divided by the total."
        actions={
          <Button variant="secondary" size="sm" leftIcon={<Plus />} onClick={() => append(emptyCompetency())}>
            Add competency
          </Button>
        }
      />
      <CardContent className="space-y-4">
        {arrayError ? (
          <p className="text-sm font-medium text-rose-600" role="alert">
            {arrayError}
          </p>
        ) : null}
        {fields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No competencies yet. Add one, or use “Suggest from job”.
          </p>
        ) : (
          <ol className="space-y-4">
            {fields.map((field, index) => (
              <CompetencyCard
                key={field.id}
                index={index}
                total={total}
                questionCount={questionCountFor(index)}
                canRemove={fields.length > 1}
                onRemove={() => {
                  const hasContent = Boolean(competencies?.[index]?.name?.trim()) || questionCountFor(index) > 0;
                  if (hasContent) setPendingRemoval(index);
                  else remove(index);
                }}
                onRenamed={renameReferences}
              />
            ))}
          </ol>
        )}
        {fields.length > 0 ? (
          <Button variant="ghost" size="sm" leftIcon={<Plus />} onClick={() => append(emptyCompetency())}>
            Add another competency
          </Button>
        ) : null}
      </CardContent>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onClose={() => setPendingRemoval(null)}
        onConfirm={() => {
          if (pendingRemoval !== null) remove(pendingRemoval);
          setPendingRemoval(null);
        }}
        tone="danger"
        title={removalName ? `Remove “${removalName}”?` : "Remove this competency?"}
        description={
          removalQuestions > 0
            ? `${pluralize(removalQuestions, "question is", "questions are")} linked to it. They are kept but must be assigned to another competency before you can save.`
            : "Its description and rubric are removed from the template."
        }
        confirmLabel="Remove competency"
      />
    </Card>
  );
}
