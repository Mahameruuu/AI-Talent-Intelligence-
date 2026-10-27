import { SlidersHorizontal } from "lucide-react";
import { useId } from "react";
import { useFormContext, useWatch, type FieldPath } from "react-hook-form";
import { Card, CardContent, CardHeader, FormField, Input } from "@/components/ui";
import { CONVERSATIONAL_LIMITS, LIMITS, type TemplateFormValues } from "./template-form";

type NumericField =
  | "num_questions"
  | "duration_minutes"
  | "follow_up_rules.max_follow_ups_per_question"
  | "follow_up_rules.min_answer_words"
  | "invitation_expiry_hours";

function NumberField({
  name,
  label,
  hint,
  error,
  min,
  max,
  suffix,
}: {
  name: NumericField & FieldPath<TemplateFormValues>;
  label: string;
  hint?: string;
  error?: string;
  min: number;
  max: number;
  suffix?: string;
}) {
  const { register } = useFormContext<TemplateFormValues>();
  const id = useId();
  return (
    <FormField label={label} htmlFor={id} required error={error} hint={hint}>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          aria-invalid={error ? true : undefined}
          className={suffix ? "pr-16" : undefined}
          {...register(name, { valueAsNumber: true })}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span>
        ) : null}
      </div>
    </FormField>
  );
}

function describeHours(hours: number): string | undefined {
  if (!Number.isFinite(hours) || hours <= 0) return undefined;
  if (hours < 24) return `${hours} h after the invitation is created`;
  const days = hours / 24;
  const label = Number.isInteger(days) ? `${days}` : days.toFixed(1);
  return `≈ ${label} ${days === 1 ? "day" : "days"} after the invitation is created`;
}

export function SettingsSection() {
  const {
    control,
    formState: { errors },
  } = useFormContext<TemplateFormValues>();
  const questionCount = useWatch({ control, name: "questions" })?.length ?? 0;
  const expiryHours = Number(useWatch({ control, name: "invitation_expiry_hours" }));
  const conversational = useWatch({ control, name: "mode" }) === "conversational";
  const limits = conversational ? CONVERSATIONAL_LIMITS : LIMITS;

  return (
    <Card>
      <CardHeader icon={<SlidersHorizontal />} title="Interview settings" />
      <CardContent className="space-y-4">
        <NumberField
          name="num_questions"
          label={conversational ? "Number of questions" : "Template questions per interview"}
          suffix="questions"
          min={limits.numQuestions.min}
          max={limits.numQuestions.max}
          error={errors.num_questions?.message}
          hint={
            conversational
              ? `${limits.numQuestions.min}–${limits.numQuestions.max}, including the self-introduction. With 4–5 the last one is “any questions?”.`
              : `Main questions from the bank, asked after the CV-based ones; follow-ups excluded. The bank has ${questionCount}.`
          }
        />
        <NumberField
          name="duration_minutes"
          label="Expected duration"
          suffix="minutes"
          min={limits.duration.min}
          max={limits.duration.max}
          error={errors.duration_minutes?.message}
          hint={
            conversational
              ? `${limits.duration.min}–${limits.duration.max} minutes. Shown to the candidate before they start.`
              : "Shown to the candidate before they start."
          }
        />
        {/* Conversational interviews pace themselves, so the follow-up rules don't apply. */}
        {conversational ? null : (
          <>
            <NumberField
              name="follow_up_rules.max_follow_ups_per_question"
              label="Max. follow-ups per question"
              min={LIMITS.followUps.min}
              max={LIMITS.followUps.max}
              error={errors.follow_up_rules?.max_follow_ups_per_question?.message}
              hint="Asked when an answer is too short or lacks detail. 0 disables follow-ups."
            />
            <NumberField
              name="follow_up_rules.min_answer_words"
              label="Min. answer length"
              suffix="words"
              min={LIMITS.minAnswerWords.min}
              max={LIMITS.minAnswerWords.max}
              error={errors.follow_up_rules?.min_answer_words?.message}
              hint="Shorter answers can trigger a follow-up question."
            />
          </>
        )}
        <NumberField
          name="invitation_expiry_hours"
          label="Invitation link valid for"
          suffix="hours"
          min={LIMITS.expiryHours.min}
          max={LIMITS.expiryHours.max}
          error={errors.invitation_expiry_hours?.message}
          hint={describeHours(expiryHours) ?? "How long the candidate's link stays active."}
        />
      </CardContent>
    </Card>
  );
}
