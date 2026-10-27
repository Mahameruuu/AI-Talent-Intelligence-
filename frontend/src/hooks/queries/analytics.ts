import { useQuery } from "@tanstack/react-query";
import { analyticsApi } from "@/services/analytics-api";
import { queryKeys } from "@/services/query-keys";

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.analytics.dashboard,
    queryFn: ({ signal }) => analyticsApi.dashboard(signal),
  });
}
