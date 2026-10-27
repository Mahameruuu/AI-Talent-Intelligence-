import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Ban, Eye, Lock, Pencil, Plus, Rocket, Save } from "lucide-react";
import { useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { FormProvider, useFieldArray, useForm, type FieldErrors } from "react-hook-form";
import { Link } from "react-router";
import {
  Alert,
  Button,
  Dialog,
  DropdownMenu,
  StatusBadge,
  useToast,
} from "@/components/ui";
import { FormActionDialogs } from "@/features/application-forms/components/FormActionDialogs";
import { MAX_CUSTOM_FIELDS, withBuiltInFallback } from "@/features/application-forms/form-fields";
import { useFormActions } from "@/features/application-forms/use-form-actions";
import { useSaveForm } from "@/hooks/queries/forms";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { getErrorMessage } from "@/services/api-client";
import type { ApplicationForm, BuiltInFormField, FormFieldType, Job } from "@/types/api";
import { jobSubtitle } from "@/features/jobs/job-utils";
import {
  builderSchema,
  duplicateField,
  emptyField,
  toBuilderValues,
  toFormInput,
  type BuilderFieldValues,
  type BuilderValues,
} from "./builder-form";
import { FormPreview } from "./FormPreview";
import { FilePreview } from "./AnswerPreview";
import { QuestionCard } from "./QuestionCard";
import { ShareBar } from "./ShareBar";

/** Textarea without a box that grows with its content (form description). */
function AutoGrowTextarea({ ref, onInput, className, ...props }: ComponentProps<"textarea">) {
  const local = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => {
    const element = local.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  };
  useEffect(resize, []);
  return (
    <textarea
      rows={1}
      {...props}
      ref={(element) => {
        local.current = element;
        if (typeof ref === "function") ref(element);
        else if (ref) ref.current = element;
      }}
      onInput={(event) => {
        resize();
        onInput?.(event);
      }}
      className={className}
    />
  );
}

/** Read-only preview of the built-in fields as applicants see them. */
function ApplicantDetailsCard({ fields }: { fields: BuiltInFormField[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6" data-testid="built-in-fields">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Applicant details</h2>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          <Lock className="size-3.5" aria-hidden />
          Always included
        </span>
      </div>
      <div className="space-y-5">
        {fields.map((field) => (
          <div key={field.id} data-testid={`built-in-${field.id}`}>
            <p className="text-sm font-medium text-slate-800">
              {field.label}
              <span className="ml-0.5 text-rose-600" aria-hidden>
                *
              </span>
            </p>
            <div className="mt-2">
              {field.type === "file" ? (
                <FilePreview />
              ) : (
                <input
                  disabled
                  aria-label={field.label}
                  placeholder={field.type === "email" ? "name@example.com" : field.type === "phone" ? "08…" : "Short answer text"}
                  className="w-full border-0 border-b border-dotted border-slate-300 bg-transparent px-0 py-1.5 text-sm placeholder:text-slate-400 sm:max-w-sm"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Ready-made questions HR often asks; added as the active card so they can be adjusted. */
const QUICK_QUESTIONS: { label: string; type: FormFieldType; options?: string[] }[] = [
  { label: "Are you willing to relocate?", type: "yes_no" },
  { label: "Expected monthly salary (IDR)", type: "number" },
  { label: "Notice period", type: "select", options: ["Immediately", "1 month", "2 months", "3 months or more"] },
];

function quickField(template: (typeof QUICK_QUESTIONS)[number]): BuilderFieldValues {
  const field = emptyField(template.type);
  return {
    ...field,
    label: template.label,
    required: true,
    options: template.options ? template.options.map((value) => ({ value })) : field.options,
  };
}

export interface FormBuilderProps {
  job: Pick<Job, "id" | "title" | "status" | "employment_type" | "closes_on" | "closes_time">;
  form: ApplicationForm;
}

export function FormBuilder({ job, form }: FormBuilderProps) {
  const toast = useToast();
  const formId = useId();
  const baseId = useId();
  const saveMutation = useSaveForm(job.id);
  const actions = useFormActions();
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  // Only one question is active (being edited) at a time; by index, kept in step with moves and removals.
  const [active, setActive] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ index: number; reason: "invalid" | "new" } | null>(null);
  const builtInFields = withBuiltInFallback(form.built_in_fields);

  const methods = useForm<BuilderValues>({
    resolver: zodResolver(builderSchema),
    defaultValues: toBuilderValues(form),
    // Questions are collapsed, so focus is moved by hand to the first invalid one (see onInvalid).
    shouldFocusError: false,
  });
  const {
    control,
    register,
    handleSubmit,
    reset,
    setFocus,
    getValues,
    formState: { errors, isDirty },
  } = methods;
  const { fields, append, insert, remove, move } = useFieldArray({ control, name: "fields", keyName: "fieldKey" });
  const fieldKeys = fields.map((field) => field.fieldKey);
  const busy = saveMutation.isPending || actions.pending !== undefined;

  useUnsavedChangesWarning(isDirty && !saveMutation.isPending);

  // Scroll a newly added / duplicated question into view, or focus the first invalid input of one
  // that was just activated because of an error.
  useEffect(() => {
    if (!focusRequest) return;
    const card = document.querySelector<HTMLElement>(`[data-question-index="${focusRequest.index}"]`);
    card?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    if (focusRequest.reason === "new") return;
    const invalid = card?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target =
      invalid && !invalid.matches("input,select,textarea,button")
        ? invalid.querySelector<HTMLElement>("input,select,textarea,button")
        : (invalid ?? card?.querySelector<HTMLElement>("fieldset input"));
    target?.focus();
  }, [focusRequest]);

  const save = (values: BuilderValues, then?: (saved: ApplicationForm) => void) => {
    setSaveError(null);
    saveMutation.mutate(toFormInput(values), {
      onSuccess: (saved) => {
        reset(toBuilderValues(saved));
        if (then) {
          then(saved);
          return;
        }
        toast.success(
          "Form saved",
          saved.status === "published" ? "Changes apply to new applications right away." : undefined,
        );
      },
      onError: (error) => {
        const message = getErrorMessage(error);
        setSaveError(message);
        toast.error("Couldn't save the form", message);
      },
    });
  };

  const onInvalid = (formErrors: FieldErrors<BuilderValues>) => {
    toast.error("Check the highlighted fields", "Some questions need attention before the form can be saved.");
    if (formErrors.title) {
      setFocus("title");
      return;
    }
    if (formErrors.intro) {
      setFocus("intro");
      return;
    }
    const first = fields.findIndex((_, index) => Boolean(formErrors.fields?.[index]));
    if (first >= 0) {
      setActive(first);
      setFocusRequest({ index: first, reason: "invalid" });
    }
  };

  const onSubmit = handleSubmit((values) => save(values), onInvalid);

  // Publishing unsaved edits saves them first, so what's published matches the screen.
  const publish = () => {
    if (isDirty) {
      void handleSubmit((values) => save(values, (saved) => actions.run(saved, "publish")), onInvalid)();
    } else {
      actions.run(form, "publish");
    }
  };

  const addField = (field: BuilderFieldValues = emptyField()) => {
    const index = fields.length;
    append(field, { focusName: `fields.${index}.label` });
    setActive(index);
    setFocusRequest({ index, reason: "new" });
  };
  const duplicate = (at: number) => {
    if (fields.length >= MAX_CUSTOM_FIELDS) return;
    insert(at + 1, duplicateField(getValues(`fields.${at}`)), { focusName: `fields.${at + 1}.label` });
    setActive(at + 1);
    setFocusRequest({ index: at + 1, reason: "new" });
  };
  const moveField = (from: number, to: number) => {
    move(from, to);
    setActive((current) => (current === from ? to : current === to ? from : current));
  };
  const removeField = (at: number) => {
    remove(at);
    setActive((current) => (current === null || current === at ? null : current > at ? current - 1 : current));
  };

  const arrayError = errors.fields?.root?.message ?? errors.fields?.message;
  const atLimit = fields.length >= MAX_CUSTOM_FIELDS;
  const live = form.status === "published";

  return (
    <div className="mx-auto max-w-3xl pb-4">
      <div className="mb-5 space-y-3">
        <Link
          to="/jobs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Jobs
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Application form</h1>
              <StatusBadge kind="form" value={form.status} />
            </div>
            <p className="text-sm text-slate-500">{jobSubtitle(job)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" leftIcon={<Eye />} onClick={() => setPreviewOpen(true)}>
              Preview
            </Button>
            <>
              <Button
                type="submit"
                form={formId}
                variant="secondary"
                leftIcon={<Save />}
                loading={saveMutation.isPending}
                disabled={!isDirty || actions.pending !== undefined}
              >
                Save
              </Button>
              {!live ? (
                <Button
                  leftIcon={<Rocket />}
                  onClick={publish}
                  loading={actions.pending?.action === "publish"}
                  disabled={busy}
                >
                  {form.status === "closed" ? "Publish again" : "Publish"}
                </Button>
              ) : null}
              <DropdownMenu
                label="More form actions"
                variant="secondary"
                size="icon"
                items={[
                  { label: "Edit job", icon: <Pencil />, to: `/jobs/${job.id}/edit?from=form` },
                  live && {
                    label: "Close applications",
                    icon: <Ban />,
                    tone: "danger",
                    disabled: busy,
                    onSelect: () => actions.requestConfirm(form, "close"),
                  },
                ]}
              />
            </>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {job.status === "closed" ? (
          <Alert tone="warning" title="This job is closed">
            The form doesn&apos;t accept applications until the job is reopened.
          </Alert>
        ) : null}

        <ShareBar
          form={form}
          busy={busy}
          onRegenerate={() => actions.requestConfirm(form, "regenerate")}
        />

        <FormProvider {...methods}>
          <form
            id={formId}
            onSubmit={(event) => void onSubmit(event)}
            noValidate
            className="-mx-4 space-y-4 bg-slate-100/80 px-3 py-4 sm:mx-0 sm:rounded-2xl sm:p-5"
          >
            {saveError ? (
              <Alert tone="danger" title="The form wasn't saved">
                {saveError}
              </Alert>
            ) : null}

            <div className="overflow-hidden rounded-xl border border-slate-200 border-t-8 border-t-indigo-600 bg-white shadow-xs">
              <fieldset className="min-w-0 space-y-2 p-4 sm:p-6">
                <legend className="sr-only">Form details</legend>
                <input
                  aria-label="Form title"
                  placeholder="Form title"
                  aria-invalid={errors.title ? true : undefined}
                  className="w-full border-0 border-b-2 border-transparent bg-transparent py-1 text-2xl font-semibold text-slate-900 placeholder:text-slate-400 hover:border-slate-200 focus:border-indigo-600 focus:outline-none disabled:hover:border-transparent aria-[invalid=true]:border-rose-500 sm:text-3xl"
                  {...register("title")}
                />
                {errors.title?.message ? (
                  <p className="text-xs font-medium text-rose-600" role="alert">
                    {errors.title.message}
                  </p>
                ) : null}
                <AutoGrowTextarea
                  aria-label="Form description"
                  placeholder="Form description (optional)"
                  className="block w-full resize-none overflow-hidden border-0 border-b border-transparent bg-transparent py-1 text-sm leading-relaxed text-slate-600 placeholder:text-slate-400 hover:border-slate-200 focus:border-indigo-600 focus:outline-none disabled:hover:border-transparent"
                  {...register("intro")}
                />
                {errors.intro?.message ? (
                  <p className="text-xs font-medium text-rose-600" role="alert">
                    {errors.intro.message}
                  </p>
                ) : null}
              </fieldset>
            </div>

            <ApplicantDetailsCard fields={builtInFields} />

            <section aria-labelledby={`${baseId}-questions`} className="space-y-3">
              <div className="flex items-baseline justify-between gap-2 px-1">
                <h2 id={`${baseId}-questions`} className="text-base font-semibold text-slate-900">
                  Questions
                </h2>
                <span className="text-xs text-slate-500">
                  {fields.length} / {MAX_CUSTOM_FIELDS}
                </span>
              </div>

              {arrayError ? (
                <p className="text-sm font-medium text-rose-600" role="alert">
                  {arrayError}
                </p>
              ) : null}

              {fields.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
                  No extra questions yet.
                </p>
              ) : (
                <ol className="space-y-3" aria-label="Questions">
                  {fields.map((field, index) => (
                    <QuestionCard
                      key={field.fieldKey}
                      index={index}
                      count={fields.length}
                      active={active === index}
                      onActivate={() => setActive(index)}
                      onMove={moveField}
                      onRemove={removeField}
                      onDuplicate={duplicate}
                    />
                  ))}
                </ol>
              )}

              <div className="space-y-3">
                <Button
                  variant="outline"
                  size="lg"
                  leftIcon={<Plus />}
                  onClick={() => addField()}
                  disabled={atLimit}
                  className="w-full border-2 border-dashed bg-white"
                >
                  Add question
                </Button>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>Quick add:</span>
                  {QUICK_QUESTIONS.map((template) => (
                    <button
                      key={template.label}
                      type="button"
                      disabled={atLimit}
                      onClick={() => addField(quickField(template))}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-700 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-800 disabled:opacity-50"
                    >
                      + {template.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {isDirty ? (
              <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-xs">
                <p className="text-sm font-medium text-amber-700">Unsaved changes</p>
                <Button type="submit" leftIcon={<Save />} loading={saveMutation.isPending}>
                  Save changes
                </Button>
              </div>
            ) : null}
          </form>

          <Dialog
            open={previewOpen}
            onClose={() => setPreviewOpen(false)}
            title="Preview"
            description="What applicants see."
            size="lg"
          >
            <FormPreview builtInFields={builtInFields} fieldKeys={fieldKeys} />
          </Dialog>
        </FormProvider>
      </div>

      <FormActionDialogs
        confirm={actions.confirm}
        onCancel={actions.cancelConfirm}
        onConfirm={actions.run}
        loading={actions.pending !== undefined}
      />
    </div>
  );
}
