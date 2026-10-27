import { useNavigate } from "react-router";
import { useToast } from "@/components/ui";
import { useCreateForm } from "@/hooks/queries/forms";
import { getErrorMessage, isApiError } from "@/services/api-client";

export function formBuilderPath(jobId: number): string {
  return `/jobs/${jobId}/form`;
}

/** Create a job's application form (draft with suggested questions) and open the builder. */
export function useCreateFormAndOpen() {
  const toast = useToast();
  const navigate = useNavigate();
  const mutation = useCreateForm();

  const create = (jobId: number) =>
    mutation.mutate(jobId, {
      onSuccess: () => {
        toast.success("Draft form created", "We added a few suggested questions. Adjust them, then publish the form.");
        void navigate(formBuilderPath(jobId));
      },
      onError: (error) => {
        // Someone else created it in the meantime: just open it.
        if (isApiError(error) && error.code === "form_exists") {
          void navigate(formBuilderPath(jobId));
          return;
        }
        toast.error("Couldn't create the form", getErrorMessage(error));
      },
    });

  return { create, pendingJobId: mutation.isPending ? mutation.variables : undefined };
}
