import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isNotFoundError } from "@/services/api-client";
import { emailLogsApi, type EmailLogParams } from "@/services/email-logs-api";
import { interviewsApi, templatesApi, type InterviewListParams } from "@/services/interviews-api";
import { queryKeys } from "@/services/query-keys";
import type {
  InterviewEvaluation,
  InterviewSession,
  InterviewTemplate,
  InterviewTemplateInput,
  InterviewTemplateUpdateInput,
} from "@/types/api";
import { POLL_INTERVAL_MS, isEvaluationRunning } from "./shared";

// ----- Templates -----

export function useTemplates(params: { job_id?: number } = {}) {
  return useQuery({
    queryKey: queryKeys.templates.list(params),
    queryFn: ({ signal }) => templatesApi.list(params, signal),
  });
}

export function useTemplate(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.templates.detail(id ?? 0),
    queryFn: ({ signal }) => templatesApi.get(id as number, signal),
    enabled: id !== undefined,
  });
}

export function useSuggestTemplate() {
  return useMutation({ mutationFn: (jobId: number) => templatesApi.suggest(jobId) });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InterviewTemplateInput) => templatesApi.create(input),
    onSuccess: (template: InterviewTemplate) => {
      queryClient.setQueryData(queryKeys.templates.detail(template.id), template);
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

export function useUpdateTemplate(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InterviewTemplateUpdateInput) => templatesApi.update(id, input),
    onSuccess: (template: InterviewTemplate) => {
      queryClient.setQueryData(queryKeys.templates.detail(template.id), template);
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

export function useApproveTemplate(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => templatesApi.approve(id),
    onSuccess: (template: InterviewTemplate) => {
      queryClient.setQueryData(queryKeys.templates.detail(template.id), template);
      void queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
  });
}

// ----- Sessions -----

export function useInterviews(params: InterviewListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.interviews.list(params),
    queryFn: ({ signal }) => interviewsApi.list(params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useInterview(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.interviews.detail(id ?? 0),
    queryFn: ({ signal }) => interviewsApi.get(id as number, signal),
    enabled: id !== undefined,
    // Keep an in-progress transcript fresh while HR watches it.
    refetchInterval: (query) => (query.state.data?.status === "in_progress" ? 5000 : false),
  });
}

function useSessionMutationSuccess() {
  const queryClient = useQueryClient();
  return (session: InterviewSession) => {
    queryClient.setQueryData(queryKeys.interviews.detail(session.id), session);
    void queryClient.invalidateQueries({ queryKey: queryKeys.interviews.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  };
}

export function useInviteCandidate(applicationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ templateId, sendEmail }: { templateId: number; sendEmail: boolean }) =>
      interviewsApi.invite(applicationId, { template_id: templateId, send_email: sendEmail }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.interviews.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.emailLogs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.detail(applicationId) });
    },
  });
}

export function useRevokeInterview(id: number) {
  const onSuccess = useSessionMutationSuccess();
  return useMutation({ mutationFn: () => interviewsApi.revoke(id), onSuccess });
}

export function useCompleteInterview(id: number) {
  const onSuccess = useSessionMutationSuccess();
  return useMutation({ mutationFn: () => interviewsApi.complete(id), onSuccess });
}

// ----- Evaluation -----

/** Evaluation for a session; resolves to `null` when none exists yet (404). Polls while pending/processing. */
export function useEvaluation(sessionId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.interviews.evaluation(sessionId ?? 0),
    queryFn: async ({ signal }): Promise<InterviewEvaluation | null> => {
      try {
        return await interviewsApi.evaluation(sessionId as number, signal);
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    enabled: sessionId !== undefined,
    refetchInterval: (query) => (isEvaluationRunning(query.state.data?.status) ? POLL_INTERVAL_MS : false),
  });
}

export function useRerunEvaluation(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => interviewsApi.rerunEvaluation(sessionId),
    onSuccess: (evaluation: InterviewEvaluation) => {
      queryClient.setQueryData(queryKeys.interviews.evaluation(sessionId), evaluation);
      void queryClient.invalidateQueries({ queryKey: queryKeys.interviews.detail(sessionId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.interviews.all });
    },
  });
}

export function useSaveReviewerNotes(sessionId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reviewerNotes: string) => interviewsApi.saveReviewerNotes(sessionId, { reviewer_notes: reviewerNotes }),
    onSuccess: (evaluation: InterviewEvaluation) => {
      queryClient.setQueryData(queryKeys.interviews.evaluation(sessionId), evaluation);
    },
  });
}

// ----- Email log -----

export function useEmailLogs(params: EmailLogParams = {}, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.emailLogs.list(params),
    queryFn: ({ signal }) => emailLogsApi.list(params, signal),
    enabled: options.enabled ?? true,
  });
}
