import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, BadgeCheck, Save, Sparkles } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { type FieldErrors, FormProvider, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, Button, ConfirmDialog, StatusBadge, useToast } from "@/components/ui";
import {
  useApproveTemplate,
  useCreateTemplate,
  useSuggestTemplate,
  useUpdateTemplate,
} from "@/hooks/queries/interviews";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes-warning";
import { getErrorMessage } from "@/services/api-client";
import type { InterviewTemplate } from "@/types/api";
import { formatRelative } from "@/utils/format";
import { CompetenciesSection } from "./CompetenciesSection";
import { InterviewStyleSection } from "./InterviewStyleSection";
import { LanguageSection } from "./LanguageSection";
import { QuestionsSection } from "./QuestionsSection";
import { SettingsSection } from "./SettingsSection";
import { TemplateBasicsCard } from "./TemplateBasicsCard";
import { TemplateStatusCard } from "./TemplateStatusCard";
import {
  conversationalSettings,
  describeFormErrors,
  emptyTemplateValues,
  type FormErrorItem,
  templateFormSchema,
  toFormValues,
  toTemplateInput,
  type TemplateFormValues,
} from "./template-form";

const SUGGEST_EXPLANATION =
  "Drafts competencies, a 1–5 rubric for each and a question bank (in Bahasa Indonesia) from the job — using the LLM when one is configured, otherwise the built-in competency library. Nothing is saved until you click “Save as draft”.";

type DialogKind = "suggest" | "save-approved" | "approve" | null;

function formHasContent(values: Partial<TemplateFormValues>): boolean {
  if (values.name?.trim()) return true;
  if ((values.questions ?? []).some((question) => question?.text?.trim())) return true;
  return (values.competencies ?? []).some(
    (competency) =>
      Boolean(competency?.name?.trim()) ||
      Boolean(competency?.description?.trim()) ||
      (competency?.rubric ?? []).some((level) => level?.descriptor?.trim()),
  );
}

export interface TemplateEditorProps {
  /** null => create mode */
  template: InterviewTemplate | null;
  initialJobId?: number;
}

export function TemplateEditor({ template, initialJobId }: TemplateEditorProps) {
  const isNew = template === null;
  const navigate = useNavigate();
  const toast = useToast();
  const formId = useId();

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: template ? toFormValues(template) : emptyTemplateValues(initialJobId),
  });
  const {
    control,
    handleSubmit,
    reset,
    getValues,
    setFocus,
    formState: { isDirty, errors },
  } = form;
  const [errorSummary, setErrorSummary] = useState<FormErrorItem[]>([]);
  const errorCount = Object.keys(errors).length;
  // Hide the summary once every problem has been fixed.
  useEffect(() => {
    if (errorCount === 0) setErrorSummary([]);
  }, [errorCount]);
  const jobId = useWatch({ control, name: "job_id" });

  const createMutation = useCreateTemplate();
  const updateMutation = useUpdateTemplate(template?.id ?? 0);
  const approveMutation = useApproveTemplate(template?.id ?? 0);
  const suggestMutation = useSuggestTemplate();
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pendingValues, setPendingValues] = useState<TemplateFormValues | null>(null);

  useUnsavedChangesWarning(isDirty && !isSaving);

  const persist = (values: TemplateFormValues) => {
    const input = toTemplateInput(values);
    if (!template) {
      createMutation.mutate(input, {
        onSuccess: (created) => {
          toast.success("Template saved as draft", "Review it, then approve it so candidates can be invited.");
          reset(toFormValues(created));
          void navigate(`/interviews/templates/${created.id}`, { replace: true });
        },
        onError: (error) => toast.error("Couldn't save the template", getErrorMessage(error)),
      });
      return;
    }
    const wasApproved = template.status === "approved";
    updateMutation.mutate(input, {
      onSuccess: (updated) => {
        reset(toFormValues(updated));
        setDialog(null);
        setPendingValues(null);
        if (wasApproved && updated.status === "draft") {
          toast.success("Changes saved — template moved back to draft", "Approve it again before inviting new candidates.");
        } else {
          toast.success("Changes saved");
        }
      },
      onError: (error) => toast.error("Couldn't save the changes", getErrorMessage(error)),
    });
  };

  const onValid = (values: TemplateFormValues) => {
    if (template?.status === "approved") {
      setPendingValues(values);
      setDialog("save-approved");
      return;
    }
    persist(values);
  };

  const focusField = (path: string) => {
    const element = document.querySelector<HTMLElement>(`[name="${path}"]`);
    // Rubric fields live in a collapsible panel that opens when it has errors; wait a frame for it to render.
    window.requestAnimationFrame(() => {
      try {
        setFocus(path as Parameters<typeof setFocus>[0], { shouldSelect: false });
      } catch {
        // Not a registered input (e.g. an array-level error): scrolling below is enough.
      }
      (element ?? document.querySelector<HTMLElement>(`[name="${path}"]`))?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  };

  const onInvalid = (formErrors: FieldErrors<TemplateFormValues>) => {
    const summary = describeFormErrors(formErrors, getValues());
    setErrorSummary(summary);
    const first = summary[0];
    toast.error(
      summary.length === 1 ? "1 field needs attention" : `${summary.length} fields need attention`,
      first ? `${first.location}: ${first.message}` : "Some fields need attention before the template can be saved.",
    );
    if (first) focusField(first.path);
  };

  const runSuggestion = () => {
    const targetJobId = template?.job_id ?? jobId;
    if (!targetJobId) return;
    suggestMutation.mutate(targetJobId, {
      onSuccess: (suggestion) => {
        // Keep the interview style HR chose (snapping the settings to its limits when conversational).
        const mode = getValues("mode");
        const values = toFormValues({ ...suggestion, job_id: targetJobId, mode });
        const next =
          mode === "conversational" ? { ...values, ...conversationalSettings(values.num_questions, values.duration_minutes) } : values;
        // Keep the saved defaults so the form stays dirty until the suggestion is saved.
        reset(next, { keepDefaultValues: true });
        setDialog(null);
        toast.success("Suggestion applied", "Review and adjust it, then save it as a draft.");
      },
      onError: (error) => {
        setDialog(null);
        toast.error("Couldn't generate a suggestion", getErrorMessage(error));
      },
    });
  };

  const requestSuggestion = () => {
    if (formHasContent(getValues()) || !isNew) setDialog("suggest");
    else runSuggestion();
  };

  const approve = () => {
    approveMutation.mutate(undefined, {
      onSuccess: () => {
        setDialog(null);
        toast.success("Template approved", "HR can now invite candidates with it.");
      },
      onError: (error) => toast.error("Couldn't approve the template", getErrorMessage(error)),
    });
  };

  const suggestDisabled = !(template?.job_id ?? jobId);
  const suggestButton = (
    <Button
      variant="outline"
      leftIcon={<Sparkles />}
      onClick={requestSuggestion}
      loading={suggestMutation.isPending}
      disabled={suggestDisabled || isSaving}
      title={suggestDisabled ? "Choose a job first" : SUGGEST_EXPLANATION}
    >
      Suggest from job
    </Button>
  );

  const canApprove = !isNew && template.status === "draft";

  return (
    <div>
      <PageHeader
        backTo="/interviews/templates"
        backLabel="Templates"
        title={template ? template.name : "New interview template"}
        meta={template ? <StatusBadge kind="template" value={template.status} /> : null}
        description={
          template ? (
            <span>
              {template.job_title}
              {template.status === "approved" && template.approved_by ? (
                <>
                  {" "}
                  <span className="text-slate-300">·</span> Approved by {template.approved_by}
                </>
              ) : null}{" "}
              <span className="text-slate-300">·</span> Updated {formatRelative(template.updated_at)}
            </span>
          ) : (
            "Define what the AI interviewer asks and how answers are scored."
          )
        }
        actions={
          <>
            {!isNew ? suggestButton : null}
            <Button type="submit" form={formId} variant={canApprove ? "secondary" : "primary"} leftIcon={<Save />} loading={isSaving}>
              Save as draft
            </Button>
            {canApprove ? (
              <Button
                leftIcon={<BadgeCheck />}
                onClick={() => setDialog("approve")}
                disabled={isDirty || isSaving}
                title={isDirty ? "Save changes first" : undefined}
              >
                {isDirty ? "Approve (save changes first)" : "Approve"}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 space-y-3">
        {isNew ? (
          <Alert tone="info" title="Start from a suggestion" icon={Sparkles} action={suggestButton}>
            {SUGGEST_EXPLANATION}
          </Alert>
        ) : null}
      </div>

      {errorSummary.length > 0 ? (
        <Alert tone="danger" title="The template can't be saved yet" icon={AlertTriangle} className="mb-6">
          <p>Fix these fields (click one to jump to it):</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errorSummary.slice(0, 8).map((item) => (
              <li key={`${item.path}-${item.message}`}>
                <button
                  type="button"
                  className="text-left underline decoration-rose-300 underline-offset-2 hover:decoration-rose-600"
                  onClick={() => focusField(item.path)}
                >
                  <span className="font-medium">{item.location}</span>: {item.message}
                </button>
              </li>
            ))}
          </ul>
          {errorSummary.length > 8 ? <p className="mt-2">…and {errorSummary.length - 8} more.</p> : null}
        </Alert>
      ) : null}

      <FormProvider {...form}>
        <form id={formId} onSubmit={(event) => void handleSubmit(onValid, onInvalid)(event)} noValidate>
          <fieldset className="min-w-0">
            <legend className="sr-only">Interview template</legend>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="min-w-0 space-y-6">
                <TemplateBasicsCard template={template} />
                <InterviewStyleSection />
                <CompetenciesSection />
                <QuestionsSection />
              </div>
              <div className="min-w-0 space-y-6">
                <TemplateStatusCard template={template} isDirty={isDirty} />
                <LanguageSection />
                <SettingsSection />
              </div>
            </div>

            <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:shadow-xs">
              <p className="mr-auto text-sm text-slate-500">
                {isDirty ? (
                  <span className="font-medium text-amber-700">Unsaved changes</span>
                ) : isNew ? (
                  "Fill in the template, then save it as a draft."
                ) : (
                  "All changes saved."
                )}
              </p>
              <Button type="submit" leftIcon={<Save />} loading={isSaving}>
                Save as draft
              </Button>
            </div>
          </fieldset>
        </form>
      </FormProvider>

      <ConfirmDialog
        open={dialog === "suggest"}
        onClose={() => setDialog(null)}
        onConfirm={runSuggestion}
        loading={suggestMutation.isPending}
        title="Replace the form with a suggestion?"
        description={`The current competencies, rubric, questions and settings in the form are replaced. ${SUGGEST_EXPLANATION}`}
        confirmLabel="Replace with suggestion"
      />
      <ConfirmDialog
        open={dialog === "save-approved"}
        onClose={() => {
          setDialog(null);
          setPendingValues(null);
        }}
        onConfirm={() => {
          if (pendingValues) persist(pendingValues);
        }}
        loading={updateMutation.isPending}
        title="Save changes to an approved template?"
        description="Editing an approved template moves it back to draft. It must be approved again before it can be used for new invitations."
        confirmLabel="Save & move to draft"
      />
      <ConfirmDialog
        open={dialog === "approve"}
        onClose={() => setDialog(null)}
        onConfirm={approve}
        loading={approveMutation.isPending}
        title="Approve this template?"
        description="Once approved, HR can use it to invite candidates for this job. Any later edit moves it back to draft."
        confirmLabel="Approve template"
      />
    </div>
  );
}
