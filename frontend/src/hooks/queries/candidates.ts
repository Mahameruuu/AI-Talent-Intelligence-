import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { applicationsApi, candidatesApi, type ApplicationListParams, type CandidateListParams } from "@/services/candidates-api";
import { queryKeys } from "@/services/query-keys";
import type {
  Application,
  ApplicationDecisionInput,
  ApplicationUpdateInput,
  Candidate,
  CandidateProfileCorrections,
} from "@/types/api";
import { isDocumentProcessing } from "./shared";

const APPLICATIONS_POLL_MS = 4000;

export function useCandidates(params: CandidateListParams) {
  return useQuery({
    queryKey: queryKeys.candidates.list(params),
    queryFn: ({ signal }) => candidatesApi.list(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useCandidate(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.candidates.detail(id ?? 0),
    queryFn: ({ signal }) => candidatesApi.get(id as number, signal),
    enabled: id !== undefined,
  });
}

export function useCorrectCandidate(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (corrections: CandidateProfileCorrections) => candidatesApi.correct(id, corrections),
    onSuccess: (candidate: Candidate) => {
      queryClient.setQueryData(queryKeys.candidates.detail(id), candidate);
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.lists });
    },
  });
}

/** One row per application (applicant × job), with the latest screening summary. */
export function useApplications(params: ApplicationListParams) {
  return useQuery({
    queryKey: queryKeys.applications.list(params),
    queryFn: ({ signal }) => applicationsApi.list(params, signal),
    placeholderData: keepPreviousData,
    // Keep "Processing…" rows fresh until their CV has been screened.
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => isDocumentProcessing(item.latest_document?.status)) ? APPLICATIONS_POLL_MS : false,
  });
}

export function useApplication(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.applications.detail(id ?? 0),
    queryFn: ({ signal }) => applicationsApi.get(id as number, signal),
    enabled: id !== undefined,
  });
}

export function useUpdateApplication(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationUpdateInput) => applicationsApi.update(id, input),
    onSuccess: (application: Application) => {
      queryClient.setQueryData(queryKeys.applications.detail(id), application);
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.detail(application.candidate_id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.screenings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
}

/** Final HR hiring decision (accept / reject) after the AI interview. */
export function useDecideApplication(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ApplicationDecisionInput) => applicationsApi.decide(id, input),
    onSuccess: (application: Application) => {
      queryClient.setQueryData(queryKeys.applications.detail(id), application);
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.interviews.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.screenings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
}

/** Invalidate everything that changes after new CVs are uploaded or processed. */
export function useInvalidateRecruitingData() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.screenings.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  };
}

/** Query keys that belong to deleted records: they must never be refetched (they would 404). */
function forgetDeleted(queryClient: QueryClient, isDeleted: (key: QueryKey) => boolean) {
  void queryClient.cancelQueries({ predicate: (query) => isDeleted(query.queryKey) });
  queryClient.removeQueries({ predicate: (query) => isDeleted(query.queryKey) });
  // Lists, job counts, analytics, interviews and email logs all change.
  for (const key of [
    queryKeys.candidates.all,
    queryKeys.applications.all,
    queryKeys.jobs.all,
    queryKeys.screenings.all,
    queryKeys.interviews.all,
    queryKeys.emailLogs.all,
    queryKeys.analytics.all,
  ]) {
    void queryClient.invalidateQueries({ queryKey: key, predicate: (query) => !isDeleted(query.queryKey) });
  }
}

function isDetailOf(key: QueryKey, root: string, ids: number[]): boolean {
  return key[0] === root && key[1] === "detail" && typeof key[2] === "number" && ids.includes(key[2]);
}

/** Permanently delete a candidate and all their data. */
export function useDeleteCandidate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => candidatesApi.remove(id),
    onSuccess: (_data, id) => {
      const cached = queryClient.getQueryData<Candidate>(queryKeys.candidates.detail(id));
      const applicationIds = cached?.applications.map((item) => item.id) ?? [];
      const documentIds = cached?.documents.map((doc) => doc.id) ?? [];
      forgetDeleted(
        queryClient,
        (key) =>
          isDetailOf(key, "candidates", [id]) ||
          isDetailOf(key, "applications", applicationIds) ||
          (key[0] === "documents" && typeof key[1] === "number" && documentIds.includes(key[1])),
      );
    },
  });
}

/** Permanently delete one application. If it was the candidate's last one, the candidate is deleted too. */
export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; candidateId: number }) => applicationsApi.remove(id),
    onSuccess: (_data, { id, candidateId }) => {
      const cached = queryClient.getQueryData<Candidate>(queryKeys.candidates.detail(candidateId));
      const candidateGone = cached !== undefined && cached.applications.every((item) => item.id === id);
      forgetDeleted(
        queryClient,
        (key) => isDetailOf(key, "applications", [id]) || (candidateGone && isDetailOf(key, "candidates", [candidateId])),
      );
    },
  });
}
