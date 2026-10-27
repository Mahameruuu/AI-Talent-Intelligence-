import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { jobsApi, type JobApplicationsParams, type JobListParams } from "@/services/jobs-api";
import { queryKeys } from "@/services/query-keys";
import type { BulkInviteInput, Job, JobInput, JobUpdateInput, Paginated, ShortlistInput } from "@/types/api";
import { OPTIONS_PAGE_SIZE } from "./shared";

export function useJobs(params: JobListParams) {
  return useQuery({
    queryKey: queryKeys.jobs.list(params),
    queryFn: ({ signal }) => jobsApi.list(params, signal),
    placeholderData: keepPreviousData,
  });
}

/** All jobs (first 100) for filter dropdowns and pickers. */
export function useJobOptions() {
  return useJobs({ page: 1, page_size: OPTIONS_PAGE_SIZE });
}

export function useJob(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.jobs.detail(id ?? 0),
    queryFn: ({ signal }) => jobsApi.get(id as number, signal),
    enabled: id !== undefined,
  });
}

export function useJobApplications(id: number | undefined, params: JobApplicationsParams) {
  return useQuery({
    queryKey: queryKeys.jobs.applications(id ?? 0, params),
    queryFn: ({ signal }) => jobsApi.applications(id as number, params, signal),
    enabled: id !== undefined,
    placeholderData: keepPreviousData,
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: JobInput) => jobsApi.create(input),
    onSuccess: (job: Job) => {
      queryClient.setQueryData(queryKeys.jobs.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
}

export function useUpdateJob(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: JobUpdateInput) => jobsApi.update(id, input),
    onSuccess: (job: Job) => {
      queryClient.setQueryData(queryKeys.jobs.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
}

/** Close or reopen any job (the jobs table acts on many rows). */
export function useSetJobStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: Job["status"] }) => jobsApi.update(id, { status }),
    onSuccess: (job: Job) => {
      queryClient.setQueryData(queryKeys.jobs.detail(job.id), job);
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.forms.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, force }: { id: number; force?: boolean }) => jobsApi.remove(id, { force }),
    onSuccess: (_data, { id }) => {
      const isDeletedJob = (key: readonly unknown[]) => key[0] === "jobs" && key[1] === "detail" && key[2] === id;
      // Never refetch the deleted job's own queries (they would 404 while its page is still mounted);
      // they are garbage-collected once the page navigates away.
      void queryClient.cancelQueries({ predicate: (query) => isDeletedJob(query.queryKey) });
      queryClient.setQueriesData<Paginated<Job>>({ queryKey: ["jobs", "list"] }, (page) =>
        page ? { ...page, items: page.items.filter((job) => job.id !== id), total: Math.max(0, page.total - 1) } : page,
      );
      // A deleted job also removes its applications, forms, templates and interviews.
      void queryClient.invalidateQueries({ predicate: (query) => !isDeletedJob(query.queryKey) });
    },
  });
}

/** Invalidate everything that shows an application's stage or interview state. */
function useInvalidatePipeline() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.applications.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.screenings.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
  };
}

export function useShortlist(jobId: number) {
  const invalidate = useInvalidatePipeline();
  return useMutation({
    mutationFn: (input: ShortlistInput) => jobsApi.shortlist(jobId, input),
    onSuccess: invalidate,
  });
}

export function useBulkInvite(jobId: number) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePipeline();
  return useMutation({
    mutationFn: (input: BulkInviteInput) => jobsApi.bulkInvite(jobId, input),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: queryKeys.interviews.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.emailLogs.all });
    },
  });
}

/** "Send now" for a job's automatic AI-interview invitations. */
export function useRunAutoInvite() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidatePipeline();
  return useMutation({
    mutationFn: (jobId: number) => jobsApi.runAutoInvite(jobId),
    onSuccess: (job: Job) => {
      queryClient.setQueryData(queryKeys.jobs.detail(job.id), job);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: queryKeys.interviews.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.emailLogs.all });
    },
  });
}
