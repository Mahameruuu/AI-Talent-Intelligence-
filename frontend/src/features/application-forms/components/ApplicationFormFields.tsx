import type { ReactNode } from "react";
import type { FormField } from "@/types/api";
import type { AnswerErrors, AnswerValue, AnswerValues } from "../answer-schema";
import { emptyAnswer } from "../answer-schema";
import { AnswerField } from "./AnswerField";

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

export interface ApplicationFormFieldsProps {
  /** Built-in contact fields (full name, email, phone). */
  contactFields: FormField[];
  customFields: FormField[];
  values: AnswerValues;
  errors: AnswerErrors;
  onChange: (fieldId: string, value: AnswerValue) => void;
  /** The CV upload, rendered between the contact details and the custom questions. */
  cvSlot: ReactNode;
  idPrefix: string;
  disabled?: boolean;
}

/** The applicant-facing body of an application form (public page and builder preview). */
export function ApplicationFormFields({
  contactFields,
  customFields,
  values,
  errors,
  onChange,
  cvSlot,
  idPrefix,
  disabled,
}: ApplicationFormFieldsProps) {
  const render = (field: FormField) => (
    <AnswerField
      key={field.id}
      field={field}
      value={values[field.id] ?? emptyAnswer(field)}
      onChange={(value) => onChange(field.id, value)}
      error={errors[field.id]}
      disabled={disabled}
      idPrefix={idPrefix}
    />
  );

  return (
    <div className="space-y-6">
      <FormSection title="Your details" description="We'll use these to contact you about your application.">
        {contactFields.map(render)}
        {cvSlot}
      </FormSection>
      {customFields.length > 0 ? (
        <FormSection title="A few questions" description="Help the recruitment team get to know you.">
          {customFields.map(render)}
        </FormSection>
      ) : null}
    </div>
  );
}
