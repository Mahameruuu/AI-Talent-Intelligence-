import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ErrorState } from "./error-state";

export interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  /** Rendered while the first load is in flight (use skeletons). */
  loading: ReactNode;
  /** Rendered when `isEmpty(data)` is true. */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  errorTitle?: string;
  compactError?: boolean;
  children: (data: T) => ReactNode;
}

/** Renders the four states of a query consistently: loading, error (with retry), empty, success. */
export function QueryState<T>({
  query,
  loading,
  empty,
  isEmpty,
  errorTitle,
  compactError,
  children,
}: QueryStateProps<T>) {
  if (query.isPending) return <>{loading}</>;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        title={errorTitle}
        compact={compactError}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (empty !== undefined && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
