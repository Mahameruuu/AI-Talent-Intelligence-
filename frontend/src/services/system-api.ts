import type { HealthResponse, SystemStatus } from "@/types/api";
import { api } from "./api-client";

export const systemApi = {
  status: (signal?: AbortSignal) => api.get<SystemStatus>("/system/status", { signal }),
  health: (signal?: AbortSignal) => api.get<HealthResponse>("/health", { signal }),
};
