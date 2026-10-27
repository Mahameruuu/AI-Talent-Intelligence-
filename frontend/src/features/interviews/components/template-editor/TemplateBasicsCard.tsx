import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Card, CardContent, CardHeader, FormField, Input } from "@/components/ui";
import { JobSelect } from "@/features/jobs/components/JobSelect";
import type { InterviewTemplate } from "@/types/api";
import type { TemplateFormValues } from "./template-form";

export function TemplateBasicsCard({ template }: { template: InterviewTemplate | null }) {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<TemplateFormValues>();
  const jobFieldId = useId();
  const nameFieldId = useId();

  return (
    <Card>
      <CardHeader title="Basics" />
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {template === null ? (
          <FormField
            label="Job"
            htmlFor={jobFieldId}
            required
            error={errors.job_id?.message}
            hint="The template is used for this job's candidates."
          >
            <Controller
              control={control}
              name="job_id"
              render={({ field }) => (
                <JobSelect
                  id={jobFieldId}
                  name={field.name}
                  ref={field.ref}
                  value={field.value}
                  onValueChange={field.onChange}
                  onBlur={field.onBlur}
                  emptyLabel={null}
                  aria-invalid={errors.job_id ? true : undefined}
                />
              )}
            />
          </FormField>
        ) : (
          <FormField label="Job" htmlFor={jobFieldId} hint="The job can't be changed after the template is created.">
            <Input id={jobFieldId} value={template.job_title} readOnly disabled />
          </FormField>
        )}
        <FormField label="Template name" htmlFor={nameFieldId} required error={errors.name?.message}>
          <Input
            id={nameFieldId}
            placeholder="e.g. Data Scientist — first interview"
            aria-invalid={errors.name ? true : undefined}
            {...register("name")}
          />
        </FormField>
      </CardContent>
    </Card>
  );
}
