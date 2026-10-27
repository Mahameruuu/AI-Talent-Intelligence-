import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button, Checkbox } from "@/components/ui";
import type { AnswerErrors, AnswerValues } from "@/features/application-forms/answer-schema";
import { ApplicationFormFields } from "@/features/application-forms/components/ApplicationFormFields";
import { CvDropzone } from "@/features/application-forms/components/CvDropzone";
import { builtInContactFields } from "@/features/application-forms/form-fields";
import type { BuiltInFormField } from "@/types/api";
import { toPreviewFields, type BuilderValues } from "./builder-form";

const PREVIEW_MAX_UPLOAD_MB = 10;

/**
 * Preview of the applicant-facing form (shown in a dialog), rendered with the same components as
 * the public page. It's interactive (try typing) but nothing is ever submitted.
 */
export function FormPreview({ builtInFields, fieldKeys }: { builtInFields: BuiltInFormField[]; fieldKeys: string[] }) {
  const { control } = useFormContext<BuilderValues>();
  const [title, intro, fields] = useWatch({ control, name: ["title", "intro", "fields"] });
  const customFields = useMemo(() => toPreviewFields(fields, fieldKeys), [fields, fieldKeys]);
  const contactFields = useMemo(() => builtInContactFields(builtInFields), [builtInFields]);
  const cvLabel = builtInFields.find((field) => field.type === "file")?.label ?? "CV";

  const [values, setValues] = useState<AnswerValues>({});
  const [cv, setCv] = useState<File | null>(null);
  const [cvError, setCvError] = useState<string | undefined>(undefined);
  const [consent, setConsent] = useState(false);
  const errors: AnswerErrors = cvError ? { cv: cvError } : {};

  const reset = () => {
    setValues({});
    setCv(null);
    setCvError(undefined);
    setConsent(false);
  };

  return (
    <div aria-label="Form preview" role="region">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">Try it — nothing is submitted.</p>
        <Button variant="ghost" size="sm" leftIcon={<RotateCcw />} onClick={reset}>
          Reset
        </Button>
      </div>
      <div className="rounded-xl bg-slate-50 px-3 py-5 sm:px-4">
        <div className="space-y-5">
          <div className="px-1">
            <p className="text-lg font-semibold text-slate-900">{title?.trim() || "Untitled form"}</p>
            {intro?.trim() ? (
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-600">{intro}</p>
            ) : null}
          </div>
          <ApplicationFormFields
            contactFields={contactFields}
            customFields={customFields}
            values={values}
            errors={errors}
            onChange={(fieldId, value) => setValues((current) => ({ ...current, [fieldId]: value }))}
            idPrefix="preview"
            cvSlot={
              <CvDropzone
                id="preview-cv"
                label={cvLabel}
                file={cv}
                maxUploadMb={PREVIEW_MAX_UPLOAD_MB}
                error={cvError}
                onFileChange={(file) => {
                  setCv(file);
                  setCvError(undefined);
                }}
                onReject={setCvError}
              />
            }
          />
          <div className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
            <label htmlFor="preview-consent" className="flex cursor-pointer items-start gap-3">
              <Checkbox
                id="preview-consent"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-0.5 size-5"
              />
              <span className="text-[15px] leading-relaxed text-slate-800">
                I have read the privacy notice and agree to my information and CV being processed to assess my
                application.
              </span>
            </label>
            <Button size="lg" className="h-12 w-full text-base" disabled title="Preview only">
              Submit application
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
