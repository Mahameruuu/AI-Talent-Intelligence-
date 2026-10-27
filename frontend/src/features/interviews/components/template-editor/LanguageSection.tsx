import { Languages } from "lucide-react";
import { useId } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Card, CardContent, CardHeader, FormField, Input, Select } from "@/components/ui";
import { pluralize } from "@/utils/format";
import { INTERVIEW_LANGUAGES, INTERVIEW_LANGUAGE_LABELS } from "@/utils/labels";
import { CV_COMPETENCY_NAME, LIMITS, type TemplateFormValues } from "./template-form";

const LANGUAGE_OPTIONS = INTERVIEW_LANGUAGES.map((value) => ({ value, label: INTERVIEW_LANGUAGE_LABELS[value] }));

/** Interview language and the number of personalised questions generated from each candidate's CV. */
export function LanguageSection() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<TemplateFormValues>();
  const languageId = useId();
  const cvId = useId();
  const cvQuestions = Number(useWatch({ control, name: "cv_questions" }));
  const numQuestions = Number(useWatch({ control, name: "num_questions" }));
  const conversational = useWatch({ control, name: "mode" }) === "conversational";
  const total =
    Number.isFinite(cvQuestions) && Number.isFinite(numQuestions) ? Math.max(0, cvQuestions) + Math.max(0, numQuestions) : null;

  return (
    <Card>
      <CardHeader icon={<Languages />} title={conversational ? "Language" : "Language & personalisation"} />
      <CardContent className="space-y-4">
        <FormField
          label="Interview language"
          htmlFor={languageId}
          required
          error={errors.language?.message}
          hint="The AI interviewer speaks and listens in this language."
        >
          <Select
            id={languageId}
            options={LANGUAGE_OPTIONS}
            aria-invalid={errors.language ? true : undefined}
            {...register("language")}
          />
        </FormField>
        {/* CV-based questions are not used in conversational interviews. */}
        {conversational ? null : (
          <FormField
            label="CV-based questions per candidate"
            htmlFor={cvId}
            required
            error={errors.cv_questions?.message}
            hint={
              <>
                Generated from each candidate&apos;s CV and asked first; the competency “{CV_COMPETENCY_NAME}” is added
                automatically. 0 turns personalised questions off.
                {total !== null ? (
                  <span className="mt-1 block font-medium text-slate-600">
                    Each interview asks {pluralize(total, "question")} in total.
                  </span>
                ) : null}
              </>
            }
          >
            <div className="relative">
              <Input
                id={cvId}
                type="number"
                inputMode="numeric"
                min={LIMITS.cvQuestions.min}
                max={LIMITS.cvQuestions.max}
                step={1}
                aria-invalid={errors.cv_questions ? true : undefined}
                className="pr-20"
                {...register("cv_questions", { valueAsNumber: true })}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                questions
              </span>
            </div>
          </FormField>
        )}
      </CardContent>
    </Card>
  );
}
