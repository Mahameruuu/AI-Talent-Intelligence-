import { RefreshCw, XCircle } from "lucide-react";
import { ApiError, getErrorMessage } from "@/services/api-client";
import { cn } from "@/utils/cn";
import { Button } from "./button";

export interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  title?: string;
  className?: string;
  compact?: boolean;
}

export function ErrorState({ error, onRetry, retrying, title, className, compact }: ErrorStateProps) {
  const isNetwork = error instanceof ApiError && error.isNetworkError;
  const resolvedTitle = title ?? (isNetwork ? "Can't reach the server" : "Something went wrong");
  const code = error instanceof ApiError ? error.code : null;
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-rose-200 bg-rose-50/50 text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
        className,
      )}
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-rose-100 text-rose-600">
        <XCircle className="size-5" aria-hidden />
      </div>
      <div className="max-w-md">
        <p className="text-sm font-semibold text-slate-900">{resolvedTitle}</p>
        <p className="mt-1 text-sm text-slate-600">{getErrorMessage(error)}</p>
        {code ? <p className="mt-1 font-mono text-[11px] text-slate-400">{code}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} loading={retrying} leftIcon={<RefreshCw />}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
