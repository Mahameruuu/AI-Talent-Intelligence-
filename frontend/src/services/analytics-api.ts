import type { DashboardData } from "@/types/api";
import { api } from "./api-client";
import { dashboardSchema } from "./schemas";

export const analyticsApi = {
  /** Everything the dashboard needs in one call. */
  dashboard: (signal?: AbortSignal) => api.get<DashboardData>("/analytics/dashboard", { schema: dashboardSchema, signal }),
};
