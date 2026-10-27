import type {
  DocumentDetail,
  DocumentInfo,
  HRReview,
  HRReviewInput,
  Paginated,
  ScreeningListItem,
  ScreeningPendingResponse,
  ScreeningResult,
  ScreeningRunInput,
} from "@/types/api";
import { api, apiUpload } from "./api-client";

export interface ScreeningListParams {
  job_id?: number;
  min_score?: number;
  max_score?: number;
  reviewed?: boolean;
  page?: number;
  page_size?: number;
}

export function isScreeningPending(
  result: ScreeningResult | ScreeningPendingResponse,
): result is ScreeningPendingResponse {
  return result.status === "pending_document";
}

export const documentsApi = {
  /** Upload a new CV version to an existing application (202, or 200 for a duplicate file). */
  upload: (applicationId: number, file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("file", file);
    return apiUpload<DocumentInfo>(`/applications/${applicationId}/documents`, form, { onProgress, signal });
  },
  status: (id: number, signal?: AbortSignal) => api.get<DocumentInfo>(`/documents/${id}/status`, { signal }),
  get: (id: number, signal?: AbortSignal) => api.get<DocumentDetail>(`/documents/${id}`, { signal }),
};

export const screeningApi = {
  run: (applicationId: number, input: ScreeningRunInput = {}) =>
    api.post<ScreeningResult | ScreeningPendingResponse>(`/applications/${applicationId}/screening`, input),
  /** Latest screening; rejects with a 404 ApiError when none exists yet. */
  latest: (applicationId: number, signal?: AbortSignal) =>
    api.get<ScreeningResult>(`/applications/${applicationId}/screening`, { signal }),
  list: (params: ScreeningListParams = {}, signal?: AbortSignal) =>
    api.get<Paginated<ScreeningListItem>>("/screenings", { query: { ...params }, signal }),
};

export const reviewsApi = {
  list: (applicationId: number, signal?: AbortSignal) =>
    api.get<HRReview[]>(`/applications/${applicationId}/reviews`, { signal }),
  create: (applicationId: number, input: HRReviewInput) =>
    api.post<HRReview>(`/applications/${applicationId}/reviews`, input),
};
