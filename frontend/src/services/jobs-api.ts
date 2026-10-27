import type {
  Application,
  ApplicationStage,
  BulkInviteInput,
  BulkInviteResponse,
  Job,
  JobInput,
  JobStatus,
  JobUpdateInput,
  Paginated,
  ShortlistInput,
} from "@/types/api";
import { api } from "./api-client";

export interface JobListParams {
  q?: string;
  status?: JobStatus;
  page?: number;
  page_size?: number;
}

export interface JobApplicationsParams {
  stage?: ApplicationStage;
  min_score?: number;
  sort?: "score" | "created";
  page?: number;
  page_size?: number;
}

export const jobsApi = {
  list: (params: JobListParams = {}, signal?: AbortSignal) =>
    api.get<Paginated<Job>>("/jobs", { query: { ...params }, signal }),
  get: (id: number, signal?: AbortSignal) => api.get<Job>(`/jobs/${id}`, { signal }),
  create: (input: JobInput) => api.post<Job>("/jobs", input),
  update: (id: number, input: JobUpdateInput) => api.patch<Job>(`/jobs/${id}`, input),
  /**
   * Delete a job (with its application form and interview templates). Jobs with applications return 409
   * `job_has_applications` unless `force` is passed, which also deletes those applications.
   */
  remove: (id: number, options: { force?: boolean } = {}) =>
    api.delete(`/jobs/${id}`, { query: options.force ? { force: "true" } : undefined }),
  applications: (id: number, params: JobApplicationsParams = {}, signal?: AbortSignal) =>
    api.get<Paginated<Application>>(`/jobs/${id}/applications`, { query: { ...params }, signal }),
  /** Move applications (only from applied/screening) to `shortlisted`; returns the moved applications. */
  shortlist: (id: number, input: ShortlistInput) => api.post<Paginated<Application>>(`/jobs/${id}/shortlist`, input),
  /** Invite several applications of this job to the AI interview with one approved template. */
  bulkInvite: (id: number, input: BulkInviteInput) =>
    api.post<BulkInviteResponse>(`/jobs/${id}/interviews/bulk-invite`, input),
  /**
   * Run the automatic AI-interview invitations now (top N eligible, not yet invited). Returns the updated job;
   * 409 `no_approved_template` when the job has no approved interview template.
   */
  runAutoInvite: (id: number) => api.post<Job>(`/jobs/${id}/auto-invite/run`),
};
