import type { ApplicationForm } from "@/types/api";
import { cn } from "@/utils/cn";
import { ACCEPTING_LABELS, acceptingState } from "../form-status";

/** Small dot + label: is the public link accepting applications right now? */
export function AcceptingIndicator({ form, className }: { form: ApplicationForm; className?: string }) {
  const state = acceptingState(form);
  const accepting = state === "accepting";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        accepting ? "text-emerald-700" : "text-slate-500",
        className,
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          accepting ? "bg-emerald-500 ring-2 ring-emerald-100" : "bg-slate-300",
        )}
        aria-hidden
      />
      {ACCEPTING_LABELS[state]}
    </span>
  );
}
