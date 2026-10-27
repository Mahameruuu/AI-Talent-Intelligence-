import type {
  Application,
  ApplicationCreateInput,
  ApplicationDecisionInput,
  ApplicationStage,
  ApplicationUpdateInput,
  Candidate,
  CandidateCreateInput,
  CandidateProfileCorrections,
  CandidateSummary,
  CandidateUploadResponse,
  DocumentStatus,
  Paginated,
} from "@/types/api";
import { api, apiUpload } from "./api-client";

export interface CandidateListParams {
  q?: string;
  job_id?: number;
  stage?: ApplicationStage;
  min_score?: number;
  max_score?: number;
  doc_status?: DocumentStatus;
  page?: number;
  page_size?: number;
}

export interface ApplicationListParams {
  job_id?: number;
  stage?: ApplicationStage;
  /** Searches candidate name and email. */
  q?: string;
  /** "score" = highest match score first; default "created" (newest first). */
  sort?: "score" | "created";
  page?: number;
  page_size?: number;
}

export const candidatesApi = {
  list: (params: CandidateListParams = {}, signal?: AbortSignal) =>
    api.get<Paginated<CandidateSummary>>("/candidates", { query: { ...params }, signal }),
  get: (id: number, signal?: AbortSignal) => api.get<Candidate>(`/candidates/${id}`, { signal }),
  create: (input: CandidateCreateInput) => api.post<Candidate>("/candidates", input),
  correct: (id: number, corrections: CandidateProfileCorrections) =>
    api.patch<Candidate>(`/candidates/${id}/corrections`, corrections),
  /** Permanently deletes the candidate with all applications, CVs, screenings and interviews (204). */
  remove: (id: number) => api.delete<null>(`/candidates/${id}`),
  /** Creates candidate + application from a CV file (202). */
  upload: (file: File, jobId: number, onProgress?: (fraction: number) => void, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("file", file);
    form.append("job_id", String(jobId));
    return apiUpload<CandidateUploadResponse>("/candidates/upload", form, { onProgress, signal });
  },
};

export const applicationsApi = {
  list: (params: ApplicationListParams = {}, signal?: AbortSignal) =>
    api.get<Paginated<Application>>("/applications", { query: { ...params }, signal }),
  get: (id: number, signal?: AbortSignal) => api.get<Application>(`/applications/${id}`, { signal }),
  create: (input: ApplicationCreateInput) => api.post<Application>("/applications", input),
  update: (id: number, input: ApplicationUpdateInput) => api.patch<Application>(`/applications/${id}`, input),
  /** Final HR decision after the AI interview (accepted → hired, rejected → rejected). Can't be changed. */
  decide: (id: number, input: ApplicationDecisionInput) => api.post<Application>(`/applications/${id}/decision`, input),
  /** Permanently deletes one application (204). Deleting a candidate's last application deletes the candidate too. */
  remove: (id: number) => api.delete<null>(`/applications/${id}`),
};
