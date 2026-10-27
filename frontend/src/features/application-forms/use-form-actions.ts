import { useState } from "react";
import { useToast } from "@/components/ui";
import { useFormAction, type FormAction } from "@/hooks/queries/forms";
import { getErrorMessage, isApiError } from "@/services/api-client";
import type { ApplicationForm } from "@/types/api";

const SUCCESS: Record<FormAction, { title: string; description: string }> = {
  publish: { title: "Form published", description: "The public link now accepts applications." },
  close: { title: "Applications closed", description: "The public link now shows that applications are closed." },
  regenerate: { title: "New link created", description: "The old link no longer works. Share the new one." },
};

const FAILURE: Record<FormAction, string> = {
  publish: "Couldn't publish the form",
  close: "Couldn't close the form",
  regenerate: "Couldn't create a new link",
};

/** Actions that need a confirmation before running. */
export type ConfirmableAction = "close" | "regenerate";

/** Publish / close / regenerate with toasts and an optional confirmation step. */
export function useFormActions() {
  const toast = useToast();
  const mutation = useFormAction();
  const [confirm, setConfirm] = useState<{ form: ApplicationForm; action: ConfirmableAction } | null>(null);

  const run = (form: ApplicationForm, action: FormAction) => {
    mutation.mutate(
      { jobId: form.job_id, action },
      {
        onSuccess: () => {
          setConfirm(null);
          toast.success(SUCCESS[action].title, SUCCESS[action].description);
        },
        onError: (error) => {
          setConfirm(null);
          const message =
            isApiError(error) && error.code === "job_closed"
              ? "The job is closed. Reopen the job before publishing its application form."
              : getErrorMessage(error);
          toast.error(FAILURE[action], message);
        },
      },
    );
  };

  return {
    run,
    confirm,
    requestConfirm: (form: ApplicationForm, action: ConfirmableAction) => setConfirm({ form, action }),
    cancelConfirm: () => setConfirm(null),
    pending: mutation.isPending ? mutation.variables : undefined,
  };
}
