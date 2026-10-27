import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@/utils/cn";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Badges or meta shown next to / under the title. */
  meta?: ReactNode;
  backTo?: string;
  backLabel?: string;
  className?: string;
}

export function PageHeader({ title, description, actions, meta, backTo, backLabel = "Back", className }: PageHeaderProps) {
  return (
    <div className={cn("mb-6 space-y-3", className)}>
      {backTo ? (
        <Link
          to={backTo}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            {meta}
          </div>
          {description ? <div className="text-sm text-slate-500">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Secondary navigation (e.g. Sessions | Templates) rendered under a page header. */
export function SubNav({ items }: { items: { label: string; to: string; active: boolean }[] }) {
  return (
    <nav aria-label="Section" className="mb-6 flex gap-1 border-b border-slate-200">
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
            item.active
              ? "border-indigo-700 text-indigo-800"
              : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
