import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { isNotFoundError } from "@/services/api-client";
import { queryKeys } from "@/services/query-keys";
import { documentsApi, reviewsApi, screeningApi, type ScreeningListParams } from "@/services/screening-api";
import type { DocumentInfo, HRReviewInput, ScreeningResult } from "@/types/api";
import { POLL_INTERVAL_MS, isDocumentProcessing } from "./shared";

/** Poll `/documents/{id}/status` every ~1.5 s while queued/processing. */
export function useDocumentStatus(id: number | undefined, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.documents.status(id ?? 0),
    queryFn: ({ signal }) => documentsApi.status(id as number, signal),
    enabled: id !== undefined && enabled,
    staleTime: 0,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === undefined || isDocumentProcessing(status) ? POLL_INTERVAL_MS : false;
    },
  });
}

/**
 * Live view of a document that may still be processing. Polls while queued/processing and,
 * when processing finishes, invalidates the application, screening, document and candidate.
 */
export function useLiveDocument(document: DocumentInfo | null | undefined): DocumentInfo | null {
  const queryClient = useQueryClient();
  const processing = document ? isDocumentProcessing(document.status) : false;
  const statusQuery = useDocumentStatus(document?.id, { enabled: processing });
  // Last status seen per document, so a transition is detected even for a freshly uploaded CV.
  const previous = useRef<{ id: number; status: DocumentInfo["status"] } | null>(null);

  const polled = statusQuery.data;
  const baseId = document?.id;
  const baseStatus = document?.status;
  useEffect(() => {
    if (!polled) return;
    const was =
      previous.current?.id === polled.id ? previous.current.status : baseId === polled.id ? baseStatus : undefined;
    previous.current = { id: polled.id, status: polled.status };
    if (was && isDocumentProcessing(was) && !isDocumentProcessing(polled.status)) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.detail(polled.application_id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.screening(polled.application_id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.documents.detail(polled.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.detail(polled.candidate_id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.screenings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    }
  }, [polled, baseId, baseStatus, queryClient]);

  if (!document) return null;
  return processing && polled && polled.id === document.id ? polled : document;
}

export function useDocument(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.documents.detail(id ?? 0),
    queryFn: ({ signal }) => documentsApi.get(id as number, signal),
    enabled: id !== undefined,
  });
}

/** Latest screening for an application; resolves to `null` when none exists yet (404). */
export function useScreening(applicationId: number | undefined, options: { enabled?: boolean } = {}) {
  const { enabled = true } = options;
  return useQuery({
    queryKey: queryKeys.applications.screening(applicationId ?? 0),
    queryFn: async ({ signal }): Promise<ScreeningResult | null> => {
      try {
        return await screeningApi.latest(applicationId as number, signal);
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw error;
      }
    },
    enabled: applicationId !== undefined && enabled,
  });
}

export function useRunScreening(applicationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (force: boolean) => screeningApi.run(applicationId, { force }),
    onSuccess: (result) => {
      if (result.status === "pending_document") {
        queryClient.setQueryData(queryKeys.documents.status(result.document.id), result.document);
        void queryClient.invalidateQueries({ queryKey: queryKeys.applications.detail(applicationId) });
        return;
      }
      queryClient.setQueryData(queryKeys.applications.screening(applicationId), result);
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.detail(applicationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.screenings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.lists });
    },
  });
}

export function useScreenings(params: ScreeningListParams) {
  return useQuery({
    queryKey: queryKeys.screenings.list(params),
    queryFn: ({ signal }) => screeningApi.list(params, signal),
    placeholderData: keepPreviousData,
  });
}

export function useReviews(applicationId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.applications.reviews(applicationId ?? 0),
    queryFn: ({ signal }) => reviewsApi.list(applicationId as number, signal),
    enabled: applicationId !== undefined,
  });
}

export function useCreateReview(applicationId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HRReviewInput) => reviewsApi.create(applicationId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.detail(applicationId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.candidates.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.applications.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.screenings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
}
