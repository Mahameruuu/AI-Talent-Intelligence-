import { useCallback } from "react";
import { useSearchParams } from "react-router";
import { parseIntParam, parseNumberParam } from "@/utils/query-string";

type FilterValue = string | number | boolean | null | undefined;

/**
 * Filters stored in the URL query string so views are shareable and survive reloads.
 * Changing any filter other than `page` resets `page` to 1.
 */
export function useUrlFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const getString = useCallback((key: string): string => searchParams.get(key) ?? "", [searchParams]);
  const getInt = useCallback((key: string): number | undefined => parseIntParam(searchParams.get(key)), [searchParams]);
  const getNumber = useCallback(
    (key: string): number | undefined => parseNumberParam(searchParams.get(key)),
    [searchParams],
  );

  const setFilters = useCallback(
    (updates: Record<string, FilterValue>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(updates)) {
            if (value === undefined || value === null || value === "" || value === false) next.delete(key);
            else next.set(key, String(value));
          }
          if (!("page" in updates)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const page = Math.max(1, getInt("page") ?? 1);

  return { searchParams, getString, getInt, getNumber, setFilters, page };
}
