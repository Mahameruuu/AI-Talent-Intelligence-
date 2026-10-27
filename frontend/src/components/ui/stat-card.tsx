import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Skeleton } from "./skeleton";

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  loading?: boolean;
  className?: string;
}

/** KPI tile: label, large value, optional hint. Never renders invented numbers — pass "—" for unknown values. */
export function StatCard({ label, value, hint, icon: Icon, loading, className }: StatCardProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xs", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        {Icon ? (
          <span className="flex size-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <Icon className="size-4" aria-hidden />
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-28" />
        </div>
      ) : (
        <div>
          <p className="text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
      )}
    </div>
  );
}
