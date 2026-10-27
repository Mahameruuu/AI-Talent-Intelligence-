import type {
  DataRetentionRules,
  DataRetentionRunResult,
  DataRetentionSettings,
  ScoringWeightSettings,
  ScoringWeightsInput,
} from "@/types/api";
import { api } from "./api-client";

/** Organisation-wide scoring weights (Settings → Scoring weights), applied to every job. */
export const settingsApi = {
  scoringWeights: (signal?: AbortSignal) => api.get<ScoringWeightSettings>("/settings/scoring-weights", { signal }),
  updateScoringWeights: (input: ScoringWeightsInput) =>
    api.put<ScoringWeightSettings>("/settings/scoring-weights", input),
  /** Automatic deletion of applicant data after a job closes (Settings → Data retention). */
  dataRetention: (signal?: AbortSignal) => api.get<DataRetentionSettings>("/settings/data-retention", { signal }),
  updateDataRetention: (input: Partial<DataRetentionRules>) =>
    api.put<DataRetentionSettings>("/settings/data-retention", input),
  runDataRetention: () => api.post<DataRetentionRunResult>("/settings/data-retention/run"),
};
