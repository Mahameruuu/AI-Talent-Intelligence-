import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isNotFoundError } from "@/services/api-client";
import { formsApi, publicFormsApi } from "@/services/forms-api";
import { queryKeys } from "@/services/query-keys";
import type { ApplicationForm, ApplicationFormInput } from "@/types/api";

// ----- HR -----

export function useApplicationForms() {
  return useQuery({
    queryKey: queryKeys.forms.list,
    queryFn: ({ signal }) => formsApi.list(signal),
  });
}

/** The job's form; resolves to `null` when the job has no form yet (404). */
export function useJobForm(jobId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.forms.byJob(jobId ?? 0),
    queryFn: async ({ signal }): Promise<ApplicationForm | null> => {
      try {
        return await formsApi.getForJob(jobId as number, signal);
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    enabled: jobId !== undefined,
  });
}

function useFormMutationSuccess() {
  const queryClient = useQueryClient();
  return (form: ApplicationForm) => {
    queryClient.setQueryData(queryKeys.forms.byJob(form.job_id), form);
    void queryClient.invalidateQueries({ queryKey: queryKeys.forms.list });
  };
}

export function useCreateForm() {
  const onSuccess = useFormMutationSuccess();
  return useMutation({ mutationFn: (jobId: number) => formsApi.create(jobId), onSuccess });
}

export function useSaveForm(jobId: number) {
  const onSuccess = useFormMutationSuccess();
  return useMutation({ mutationFn: (input: ApplicationFormInput) => formsApi.save(jobId, input), onSuccess });
}

/** Publish / close / regenerate-link for any job (the list page acts on many rows). */
export type FormAction = "publish" | "close" | "regenerate";

export function useFormAction() {
  const onSuccess = useFormMutationSuccess();
  return useMutation({
    mutationFn: ({ jobId, action }: { jobId: number; action: FormAction }) => {
      if (action === "publish") return formsApi.publish(jobId);
      if (action === "close") return formsApi.close(jobId);
      return formsApi.regenerateLink(jobId);
    },
    onSuccess,
  });
}

// ----- Public (applicant) -----

export function usePublicForm(slug: string | undefined) {
  return useQuery({
    queryKey: queryKeys.publicForm(slug ?? ""),
    queryFn: ({ signal }) => publicFormsApi.get(slug as string, signal),
    enabled: Boolean(slug),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}
