import { zodResolver } from "@hookform/resolvers/zod";
import { Bot, Briefcase, CalendarClock, CheckCircle2, FileText, GraduationCap, Sparkles, TriangleAlert } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button, Card, CardContent, Checkbox, FormField, Input, Select, Switch, TagInput, Textarea } from "@/components/ui";
import type { Job, JobInput } from "@/types/api";
import { cn } from "@/utils/cn";
import { addCalendarDays, daysBetween, formatDateWib, formatDay, formatDayWithWeekday, pluralize } from "@/utils/format";
import {
  EDUCATION_LABELS,
  EDUCATION_LEVELS,
  EMPLOYMENT_TYPE_LABELS,
  EMPLOYMENT_TYPES,
  JOB_STATUS_LABELS,
} from "@/utils/labels";
import { JOB_STATUSES } from "../job-utils";
import { jobFormSchema, toFormValues, toJobInput, toNullableNumber, type JobFormValues } from "./job-form-schema";
import { RupiahInput } from "./RupiahInput";

export interface JobFormProps {
  defaultValues?: Job;
  onSubmit: (input: JobInput) => Promise<void> | void;
  submitting?: boolean;
  mode: "create" | "edit";
  onCancel?: () => void;
}

const STATUS_HINTS = {
  draft: "Not visible to applicants yet. Publish it later by switching to Open.",
  open: "Accepting applications through its public application form.",
  closed: "No new applications. Existing candidates and results are kept.",
} as const;

const MIN_DESCRIPTION = 10;

/** Numbered section card so the form reads as a short series of steps. */
function Step({
  number,
  icon,
  title,
  description,
  children,
}: {
  number: number;
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span
          aria-hidden
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200"
        >
          {number}
        </span>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="text-slate-400 [&_svg]:size-4">{icon}</span>
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <CardContent className="py-5">{children}</CardContent>
    </Card>
  );
}

/** When the automatic invitations go out (or went out), computed live from the deadline field. */
function AutoInviteSchedule({ job, closesOn }: { job: Job | undefined; closesOn: string | undefined }) {
  const autoInvite = job?.auto_invite;
  if (autoInvite?.status === "sent") {
    return (
      <p className="flex items-start gap-2 text-sm text-slate-700">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        <span>
          Invitations sent on {formatDateWib(autoInvite.ran_at)} ({pluralize(autoInvite.invited_count ?? 0, "applicant")}).
        </span>
      </p>
    );
  }
  const sendDay = closesOn ? addCalendarDays(closesOn, 1) : null;
  if (!sendDay) {
    return (
      <p className="flex items-start gap-2 text-sm text-amber-800">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
        <span>Set a closing date so invitations can be sent automatically.</span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 text-sm text-slate-700">
      <CalendarClock className="mt-0.5 size-4 shrink-0 text-indigo-600" aria-hidden />
      <span>
        Invitations are emailed on <span className="font-medium text-slate-900">{formatDayWithWeekday(sendDay)} at 08:00 WIB</span>{" "}
        — the day after applications close.
      </span>
    </p>
  );
}

/** Create / edit form for a job. Pure: it only builds the `JobInput` payload and calls `onSubmit`. */
export function JobForm({ defaultValues, onSubmit, submitting = false, mode, onCancel }: JobFormProps) {
  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: toFormValues(defaultValues, mode),
  });
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = form;
  const baseId = useId();
  const fieldId = (name: string) => `${baseId}-${name}`;
  const busy = submitting || isSubmitting;

  const [title, status, description, requiredSkills, opensOn, closesOn, autoInviteEnabled] = useWatch({
    control,
    name: ["title", "status", "description", "required_skills", "opens_on", "closes_on", "auto_invite_enabled"],
  });
  const periodDays = opensOn && closesOn && closesOn >= opensOn ? daysBetween(opensOn, closesOn) + 1 : null;
  const descriptionLength = (description ?? "").trim().length;
  const checklist = {
    title: (title ?? "").trim().length >= 2,
    description: descriptionLength >= MIN_DESCRIPTION,
    skills: (requiredSkills ?? []).length > 0,
  };
  const ready = checklist.title && checklist.description && checklist.skills;
  const statusOptions = JOB_STATUSES.filter((value) => mode === "edit" || value !== "closed").map((value) => ({
    value,
    label: JOB_STATUS_LABELS[value],
  }));

  const submit = handleSubmit(async (values) => {
    await onSubmit(toJobInput(values));
  });

  return (
    <form noValidate onSubmit={submit} aria-busy={busy || undefined}>
      <div className="space-y-6">
        <div className="space-y-6">
          <Step number={1} icon={<Briefcase />} title="Basic information" description="The role title, where it sits and when candidates can apply.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label="Job title"
                htmlFor={fieldId("title")}
                required
                error={errors.title?.message}
                className="sm:col-span-2"
              >
                <Input
                  id={fieldId("title")}
                  placeholder="e.g. Data Scientist"
                  autoComplete="off"
                  autoFocus={mode === "create"}
                  aria-invalid={errors.title ? true : undefined}
                  {...register("title")}
                />
              </FormField>
              <FormField label="Department" htmlFor={fieldId("department")} error={errors.department?.message}>
                <Input
                  id={fieldId("department")}
                  placeholder="e.g. Data & Analytics"
                  aria-invalid={errors.department ? true : undefined}
                  {...register("department")}
                />
              </FormField>
              <FormField label="Location" htmlFor={fieldId("location")} error={errors.location?.message}>
                <Input
                  id={fieldId("location")}
                  placeholder="e.g. Jakarta (hybrid)"
                  aria-invalid={errors.location ? true : undefined}
                  {...register("location")}
                />
              </FormField>
              <FormField
                label="Employment type"
                htmlFor={fieldId("employment_type")}
                required
                error={errors.employment_type?.message}
                className="sm:col-span-2"
              >
                <Select
                  id={fieldId("employment_type")}
                  wrapperClassName="sm:max-w-[calc(50%-0.5rem)]"
                  aria-invalid={errors.employment_type ? true : undefined}
                  {...register("employment_type")}
                >
                  {EMPLOYMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {EMPLOYMENT_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-medium text-slate-700">Salary range (IDR / month)</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Minimum" htmlFor={fieldId("salary_min")} error={errors.salary_min?.message}>
                    <Controller
                      control={control}
                      name="salary_min"
                      rules={{ deps: ["salary_max"] }}
                      render={({ field, fieldState }) => (
                        <RupiahInput
                          id={fieldId("salary_min")}
                          name={field.name}
                          ref={field.ref}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          disabled={busy}
                          placeholder="e.g. 12.000.000"
                          aria-invalid={fieldState.error ? true : undefined}
                        />
                      )}
                    />
                  </FormField>
                  <FormField label="Maximum" htmlFor={fieldId("salary_max")} error={errors.salary_max?.message}>
                    <Controller
                      control={control}
                      name="salary_max"
                      render={({ field, fieldState }) => (
                        <RupiahInput
                          id={fieldId("salary_max")}
                          name={field.name}
                          ref={field.ref}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          disabled={busy}
                          placeholder="e.g. 18.000.000"
                          aria-invalid={fieldState.error ? true : undefined}
                        />
                      )}
                    />
                  </FormField>
                </div>
                <label htmlFor={fieldId("salary_visible")} className="mt-3 flex cursor-pointer items-start gap-2.5">
                  <Checkbox
                    id={fieldId("salary_visible")}
                    className="mt-0.5"
                    aria-describedby={fieldId("salary_visible-hint")}
                    {...register("salary_visible")}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">Show salary range to applicants</span>
                    <span id={fieldId("salary_visible-hint")} className="block text-xs text-slate-500">
                      Optional. Otherwise only HR sees the salary range.
                    </span>
                  </span>
                </label>
              </fieldset>
              <fieldset className="sm:col-span-2">
                <legend className="mb-2 text-sm font-medium text-slate-700">Status</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {statusOptions.map((option) => {
                    const checked = status === option.value;
                    const inputId = fieldId(`status-${option.value}`);
                    return (
                      <label
                        key={option.value}
                        htmlFor={inputId}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 transition-colors",
                          "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500/50",
                          checked ? "border-indigo-500 bg-indigo-50/60" : "border-slate-200 bg-white hover:border-slate-300",
                        )}
                      >
                        <input
                          id={inputId}
                          type="radio"
                          value={option.value}
                          className="mt-0.5 size-4 shrink-0 accent-indigo-600"
                          {...register("status")}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-slate-900">{option.label}</span>
                          <span className="block text-xs text-slate-500">{STATUS_HINTS[option.value]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {errors.status?.message ? (
                  <p className="mt-1.5 text-xs text-rose-600" role="alert">
                    {errors.status.message}
                  </p>
                ) : null}
              </fieldset>
              <FormField
                label="Applications open on"
                htmlFor={fieldId("opens_on")}
                required
                error={errors.opens_on?.message}
              >
                <Input
                  id={fieldId("opens_on")}
                  type="date"
                  aria-invalid={errors.opens_on ? true : undefined}
                  {...register("opens_on", { deps: ["closes_on"] })}
                />
              </FormField>
              <FormField
                label="Application deadline"
                htmlFor={fieldId("closes_on")}
                required
                error={errors.closes_on?.message}
                hint={
                  periodDays !== null && closesOn
                    ? `Open for ${periodDays} day${periodDays === 1 ? "" : "s"} · applications accepted until 23:59 WIB on ${formatDay(closesOn)}.`
                    : "Last day candidates can apply."
                }
              >
                <Input
                  id={fieldId("closes_on")}
                  type="date"
                  min={opensOn || undefined}
                  aria-invalid={errors.closes_on ? true : undefined}
                  {...register("closes_on")}
                />
              </FormField>
            </div>
          </Step>

          <Step
            number={2}
            icon={<FileText />}
            title="Job description"
            description="Describe the role in a few sentences so candidates (and the screening) understand it."
          >
            <FormField
              label="Job description"
              htmlFor={fieldId("description")}
              required
              error={errors.description?.message}
              hint={
                <span className="flex flex-wrap justify-between gap-2">
                  <span>Responsibilities, team, products and tools.</span>
                  <span className={cn("tabular-nums", descriptionLength < MIN_DESCRIPTION && "text-amber-700")}>
                    {descriptionLength} characters{descriptionLength < MIN_DESCRIPTION ? ` · min. ${MIN_DESCRIPTION}` : ""}
                  </span>
                </span>
              }
            >
              <Textarea
                id={fieldId("description")}
                rows={9}
                placeholder={
                  "e.g. We are looking for a Data Scientist to build machine learning models for demand forecasting.\n" +
                  "You will work with SQL and Python, run experiments and present results to the business team."
                }
                aria-invalid={errors.description ? true : undefined}
                {...register("description")}
              />
            </FormField>
          </Step>

          <Step
            number={3}
            icon={<Sparkles />}
            title="Skills"
            description="Each CV is checked for these skills. Type a skill and press Enter (or a comma) to add it."
          >
            <div className="space-y-4">
              <FormField
                label="Required skills"
                htmlFor={fieldId("required_skills")}
                required
                error={errors.required_skills?.message}
                hint="Must-haves. Common spellings are recognised, e.g. “sklearn” counts as scikit-learn."
              >
                <Controller
                  control={control}
                  name="required_skills"
                  rules={{ deps: ["preferred_skills"] }}
                  render={({ field, fieldState }) => (
                    <TagInput
                      id={fieldId("required_skills")}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={busy}
                      invalid={Boolean(fieldState.error)}
                      placeholder="e.g. Python, SQL, Machine Learning"
                    />
                  )}
                />
              </FormField>
              <FormField
                label="Preferred skills"
                htmlFor={fieldId("preferred_skills")}
                error={errors.preferred_skills?.message}
                hint="Nice-to-haves that make a candidate stronger. Optional."
              >
                <Controller
                  control={control}
                  name="preferred_skills"
                  render={({ field, fieldState }) => (
                    <TagInput
                      id={fieldId("preferred_skills")}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={busy}
                      invalid={Boolean(fieldState.error)}
                      tone="neutral"
                      placeholder="e.g. Docker, Airflow"
                    />
                  )}
                />
              </FormField>
            </div>
          </Step>

          <Step
            number={4}
            icon={<GraduationCap />}
            title="Qualifications"
            description="Optional. Leave a field empty if it isn't a requirement for this role."
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Minimum education" htmlFor={fieldId("education_level")} error={errors.education_level?.message}>
                <Select id={fieldId("education_level")} {...register("education_level")}>
                  <option value="">Not specified</option>
                  {EDUCATION_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {EDUCATION_LABELS[level]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Field of study" htmlFor={fieldId("education_field")} error={errors.education_field?.message}>
                <Input
                  id={fieldId("education_field")}
                  placeholder="e.g. Computer Science"
                  aria-invalid={errors.education_field ? true : undefined}
                  {...register("education_field")}
                />
              </FormField>
              <FormField
                label="Minimum experience"
                htmlFor={fieldId("min_experience_years")}
                error={errors.min_experience_years?.message}
                hint="Whole or half years."
              >
                <div className="relative">
                  <Input
                    id={fieldId("min_experience_years")}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={50}
                    step={0.5}
                    placeholder="Not specified"
                    aria-invalid={errors.min_experience_years ? true : undefined}
                    className="pr-14 tabular-nums"
                    {...register("min_experience_years", { setValueAs: toNullableNumber })}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                    years
                  </span>
                </div>
              </FormField>
              <FormField
                label="Required certifications"
                htmlFor={fieldId("required_certifications")}
                error={errors.required_certifications?.message}
                className="sm:col-span-3"
              >
                <Controller
                  control={control}
                  name="required_certifications"
                  render={({ field, fieldState }) => (
                    <TagInput
                      id={fieldId("required_certifications")}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={busy}
                      invalid={Boolean(fieldState.error)}
                      tone="neutral"
                      placeholder="e.g. AWS Certified Solutions Architect"
                    />
                  )}
                />
              </FormField>
            </div>
          </Step>

          <Step
            number={5}
            icon={<Bot />}
            title="AI interview"
            description="Invite the best applicants to the AI interview automatically once applications close."
          >
            <div className="space-y-4">
              <Controller
                control={control}
                name="auto_invite_enabled"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={busy}
                    label={<span className="font-medium text-slate-900">Send AI interview invitations automatically</span>}
                  />
                )}
              />
              {autoInviteEnabled ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      label="Invite the top"
                      htmlFor={fieldId("auto_invite_top_n")}
                      required
                      error={errors.auto_invite_top_n?.message}
                      hint="Highest match score first, 1–100."
                    >
                      <div className="relative">
                        <Input
                          id={fieldId("auto_invite_top_n")}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={100}
                          step={1}
                          aria-invalid={errors.auto_invite_top_n ? true : undefined}
                          className="pr-24 tabular-nums"
                          {...register("auto_invite_top_n", { setValueAs: toNullableNumber })}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                          applicants
                        </span>
                      </div>
                    </FormField>
                    <FormField
                      label="Minimum match score (optional)"
                      htmlFor={fieldId("auto_invite_min_score")}
                      error={errors.auto_invite_min_score?.message}
                      hint="0–100. Leave empty for no minimum."
                    >
                      <Input
                        id={fieldId("auto_invite_min_score")}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        step={1}
                        placeholder="No minimum"
                        aria-invalid={errors.auto_invite_min_score ? true : undefined}
                        className="tabular-nums"
                        {...register("auto_invite_min_score", { setValueAs: toNullableNumber })}
                      />
                    </FormField>
                  </div>
                  <AutoInviteSchedule job={defaultValues} closesOn={closesOn} />
                  <p className="text-xs text-slate-500">
                    Applicants who don't meet a must-have question are not invited automatically. You can still invite
                    anyone manually.
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-500">Off. You can still invite applicants manually from the Candidates page.</p>
              )}
            </div>
          </Step>
        </div>

      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:bottom-4 lg:mx-0 lg:rounded-xl lg:border lg:shadow-lg">
        <p className="text-xs text-slate-500">
          {ready ? (
            <span className="font-medium text-emerald-700">Ready to {mode === "create" ? "create" : "save"}.</span>
          ) : (
            <>
              Fields marked <span className="text-rose-600">*</span> are required.
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {onCancel ? (
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          ) : null}
          <Button type="submit" loading={busy}>
            {mode === "create" ? "Create job" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}
