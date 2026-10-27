import type {
  EvaluationNotesInput,
  InterviewEvaluation,
  InterviewInvitation,
  InterviewInvitationInput,
  InterviewSession,
  InterviewStatus,
  InterviewTemplate,
  InterviewTemplateInput,
  InterviewTemplateUpdateInput,
  Paginated,
} from "@/types/api";
import { api } from "./api-client";

export interface InterviewListParams {
  status?: InterviewStatus;
  job_id?: number;
  /** Not documented; sent as a hint and results are still filtered client-side. */
  application_id?: number;
  page?: number;
  page_size?: number;
}

export const templatesApi = {
  list: (params: { job_id?: number } = {}, signal?: AbortSignal) =>
    api.get<InterviewTemplate[]>("/interview-templates", { query: { ...params }, signal }),
  suggest: (jobId: number) => api.post<InterviewTemplateInput>("/interview-templates/suggest", { job_id: jobId }),
  create: (input: InterviewTemplateInput) => api.post<InterviewTemplate>("/interview-templates", input),
  get: (id: number, signal?: AbortSignal) => api.get<InterviewTemplate>(`/interview-templates/${id}`, { signal }),
  update: (id: number, input: InterviewTemplateUpdateInput) =>
    api.patch<InterviewTemplate>(`/interview-templates/${id}`, input),
  approve: (id: number) => api.post<InterviewTemplate>(`/interview-templates/${id}/approve`),
};

export const interviewsApi = {
  list: (params: InterviewListParams = {}, signal?: AbortSignal) =>
    api.get<Paginated<InterviewSession>>("/interviews", { query: { ...params }, signal }),
  invite: (applicationId: number, input: InterviewInvitationInput) =>
    api.post<InterviewInvitation>(`/applications/${applicationId}/interviews`, input),
  get: (id: number, signal?: AbortSignal) => api.get<InterviewSession>(`/interviews/${id}`, { signal }),
  revoke: (id: number) => api.post<InterviewSession>(`/interviews/${id}/revoke`),
  complete: (id: number) => api.post<InterviewSession>(`/interviews/${id}/complete`),
  /** Rejects with a 404 ApiError when no evaluation exists yet. */
  evaluation: (id: number, signal?: AbortSignal) =>
    api.get<InterviewEvaluation>(`/interviews/${id}/evaluation`, { signal }),
  rerunEvaluation: (id: number) => api.post<InterviewEvaluation>(`/interviews/${id}/evaluation`),
  saveReviewerNotes: (id: number, input: EvaluationNotesInput) =>
    api.patch<InterviewEvaluation>(`/interviews/${id}/evaluation`, input),
};
