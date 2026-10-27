import type {
  ApplicationForm,
  ApplicationFormInput,
  ApplicationSubmitted,
  FormAnswerValue,
  PublicApplicationForm,
} from "@/types/api";
import { api, apiRequest, apiUpload } from "./api-client";
import { applicationSubmittedSchema, publicApplicationFormSchema } from "./schemas";

/** HR endpoints: one application form per job. */
export const formsApi = {
  list: (signal?: AbortSignal) => api.get<ApplicationForm[]>("/forms", { signal }),
  /** Rejects with a 404 ApiError when the job has no form yet. */
  getForJob: (jobId: number, signal?: AbortSignal) => api.get<ApplicationForm>(`/jobs/${jobId}/form`, { signal }),
  /** Creates a draft pre-filled with suggested custom fields (409 `form_exists`). */
  create: (jobId: number) => api.post<ApplicationForm>(`/jobs/${jobId}/form`),
  save: (jobId: number, input: ApplicationFormInput) => api.put<ApplicationForm>(`/jobs/${jobId}/form`, input),
  publish: (jobId: number) => api.post<ApplicationForm>(`/jobs/${jobId}/form/publish`),
  close: (jobId: number) => api.post<ApplicationForm>(`/jobs/${jobId}/form/close`),
  regenerateLink: (jobId: number) => api.post<ApplicationForm>(`/jobs/${jobId}/form/regenerate-link`),
};

export interface PublicSubmission {
  /** Keyed by field id, including the built-in `full_name`, `email` and `phone`. */
  answers: Record<string, FormAnswerValue>;
  consent: boolean;
  cv: File;
  /** Honeypot: a hidden input real applicants never fill in. */
  website: string;
}

/** Applicant-facing API (no login). Protected server-side by rate limits, a honeypot and consent. */
export const publicFormsApi = {
  get: (slug: string, signal?: AbortSignal) =>
    apiRequest<PublicApplicationForm>(`/public/forms/${encodeURIComponent(slug)}`, {
      schema: publicApplicationFormSchema,
      signal,
    }),
  /** Multipart submit via XHR so the applicant sees CV upload progress. */
  submit: (
    slug: string,
    submission: PublicSubmission,
    onProgress?: (fraction: number) => void,
    signal?: AbortSignal,
  ) => {
    const form = new FormData();
    form.append("answers", JSON.stringify(submission.answers));
    form.append("consent", submission.consent ? "true" : "false");
    form.append("website", submission.website);
    form.append("cv", submission.cv);
    return apiUpload<ApplicationSubmitted>(`/public/forms/${encodeURIComponent(slug)}/submit`, form, {
      onProgress,
      signal,
      schema: applicationSubmittedSchema,
    });
  },
};
