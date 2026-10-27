import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useId } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { Button, Card, CardContent, CardHeader, FormField, Select, Textarea } from "@/components/ui";
import { pluralize } from "@/utils/format";
import { newQuestionId, type TemplateFormValues } from "./template-form";

function QuestionRow({
  index,
  count,
  competencyNames,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  competencyNames: string[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<TemplateFormValues>();
  const baseId = useId();
  const fieldErrors = errors.questions?.[index];

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span
          className="mt-7 inline-flex h-6 min-w-8 items-center justify-center rounded-md bg-indigo-50 px-1.5 text-xs font-semibold tabular-nums text-indigo-700"
          aria-hidden
        >
          Q{index + 1}
        </span>
        <FormField
          label="Competency"
          htmlFor={`${baseId}-competency`}
          required
          error={fieldErrors?.competency?.message}
          className="min-w-48 flex-1"
        >
          <Controller
            control={control}
            name={`questions.${index}.competency`}
            render={({ field }) => {
              const current = field.value ?? "";
              const isUnknown = current !== "" && !competencyNames.includes(current.trim());
              return (
                <Select
                  id={`${baseId}-competency`}
                  aria-invalid={fieldErrors?.competency ? true : undefined}
                  name={field.name}
                  ref={field.ref}
                  value={current}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  disabled={field.disabled}
                >
                  <option value="">Choose a competency</option>
                  {isUnknown ? (
                    <option value={current} disabled>
                      {current} (no longer defined)
                    </option>
                  ) : null}
                  {competencyNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              );
            }}
          />
        </FormField>
        <div className="mt-6 flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(index, index - 1)}
            disabled={index === 0}
            aria-label={`Move question ${index + 1} up`}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(index, index + 1)}
            disabled={index === count - 1}
            aria-label={`Move question ${index + 1} down`}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onRemove(index)}
            aria-label={`Delete question ${index + 1}`}
            className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <FormField
        label="Question"
        htmlFor={`${baseId}-text`}
        required
        error={fieldErrors?.text?.message}
        className="mt-3"
      >
        <Textarea
          id={`${baseId}-text`}
          rows={2}
          className="min-h-0"
          placeholder={"e.g. Tell me about a time you had to debug a production incident under pressure."}
          aria-invalid={fieldErrors?.text ? true : undefined}
          {...register(`questions.${index}.text`)}
        />
      </FormField>
    </li>
  );
}

export function QuestionsSection() {
  const {
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useFormContext<TemplateFormValues>();
  const { fields, append, remove, move } = useFieldArray({ control, name: "questions", keyName: "fieldKey" });
  const competencies = useWatch({ control, name: "competencies" });
  const conversational = useWatch({ control, name: "mode" }) === "conversational";
  const competencyNames = Array.from(
    new Set((competencies ?? []).map((competency) => competency?.name?.trim() ?? "").filter(Boolean)),
  );

  const addQuestion = () => {
    const existingIds = getValues("questions").map((question) => question.id);
    const lastCompetency = getValues("questions").at(-1)?.competency?.trim();
    const competency = lastCompetency && competencyNames.includes(lastCompetency) ? lastCompetency : (competencyNames[0] ?? "");
    append({ id: newQuestionId(existingIds), competency, text: "" }, { focusName: `questions.${fields.length}.text` });
  };

  const arrayError = errors.questions?.root?.message ?? errors.questions?.message;

  return (
    <Card>
      <CardHeader
        title={conversational ? "Guidance questions (optional — used as a fallback)" : "Question bank"}
        description={
          conversational
            ? "The AI writes its own questions for your top-weighted competencies. These are used if the AI is unavailable, and can be left empty."
            : fields.length > 0
              ? `${pluralize(fields.length, "question")}. The AI interviewer asks them in this order and may add follow-ups based on the rules.`
              : "Main questions for the AI interviewer, each linked to a competency."
        }
        actions={
          <Button variant="secondary" size="sm" leftIcon={<Plus />} onClick={addQuestion}>
            Add question
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
            {conversational
              ? "No guidance questions — that's fine, the AI writes the questions."
              : "No questions yet. Add questions manually or use “Suggest from job”."}
          </p>
        ) : (
          <ol className="space-y-3">
            {fields.map((field, index) => (
              <QuestionRow
                key={field.fieldKey}
                index={index}
                count={fields.length}
                competencyNames={competencyNames}
                onMove={(from, to) => move(from, to)}
                onRemove={(at) => {
                  remove(at);
                  // Keep "Questions per interview" within the number of questions left.
                  const remaining = fields.length - 1;
                  if (getValues("mode") !== "conversational" && remaining > 0 && getValues("num_questions") > remaining) {
                    setValue("num_questions", remaining, { shouldDirty: true, shouldValidate: true });
                  }
                }}
              />
            ))}
          </ol>
        )}
        {fields.length > 0 ? (
          <Button variant="ghost" size="sm" leftIcon={<Plus />} onClick={addQuestion}>
            Add another question
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
