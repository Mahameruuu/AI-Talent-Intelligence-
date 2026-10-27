import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/services/query-keys";
import { settingsApi } from "@/services/settings-api";
import { systemApi } from "@/services/system-api";
import type {
  DataRetentionRules,
  DataRetentionSettings,
  ScoringWeightSettings,
  ScoringWeightsInput,
} from "@/types/api";

export function useSystemStatus(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.system.status,
    queryFn: ({ signal }) => systemApi.status(signal),
    enabled,
    refetchInterval: 30_000,
  });
}

export function useScoringWeights() {
  return useQuery({
    queryKey: queryKeys.system.scoringWeights,
    queryFn: ({ signal }) => settingsApi.scoringWeights(signal),
  });
}

export function useUpdateScoringWeights() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ScoringWeightsInput) => settingsApi.updateScoringWeights(input),
    onSuccess: (settings: ScoringWeightSettings) => {
      queryClient.setQueryData(queryKeys.system.scoringWeights, settings);
      // Scores of open jobs are recalculated in the background; refresh everything that shows them.
      for (const key of [
        queryKeys.jobs.all,
        queryKeys.applications.all,
        queryKeys.candidates.all,
        queryKeys.screenings.all,
        queryKeys.analytics.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useDataRetention() {
  return useQuery({
    queryKey: queryKeys.system.dataRetention,
    queryFn: ({ signal }) => settingsApi.dataRetention(signal),
  });
}

export function useUpdateDataRetention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<DataRetentionRules>) => settingsApi.updateDataRetention(input),
    onSuccess: (settings: DataRetentionSettings) => {
      queryClient.setQueryData(queryKeys.system.dataRetention, settings);
    },
  });
}

export function useRunDataRetention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => settingsApi.runDataRetention(),
    onSuccess: () => {
      // Deleted applicants disappear from every list, count and chart.
      for (const key of [
        queryKeys.system.dataRetention,
        queryKeys.jobs.all,
        queryKeys.applications.all,
        queryKeys.candidates.all,
        queryKeys.screenings.all,
        queryKeys.analytics.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
