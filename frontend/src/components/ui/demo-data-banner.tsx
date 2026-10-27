import { FlaskConical } from "lucide-react";
import { cn } from "@/utils/cn";

export function DemoDataBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50/70 px-4 py-3 text-sm text-violet-900",
        className,
      )}
    >
      <FlaskConical className="mt-0.5 size-4.5 shrink-0 text-violet-600" aria-hidden />
      <p>
        <span className="font-semibold">Demo data.</span> Some of the figures below come from seeded sample jobs and
        candidates, not real applicants.
      </p>
    </div>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <span
      title="Seeded demo record"
      className={cn(
        "inline-flex items-center rounded-md bg-violet-50 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-600/20",
        className,
      )}
    >
      Demo
    </span>
  );
}
