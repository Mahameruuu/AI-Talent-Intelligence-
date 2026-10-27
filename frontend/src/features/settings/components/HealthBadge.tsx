import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

export type HealthTone = "ok" | "warning" | "error" | "neutral";

const TONES: Record<HealthTone, { dot: string; badge: string; icon: LucideIcon }> = {
  ok: { dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", icon: CheckCircle2 },
  warning: { dot: "bg-amber-500", badge: "bg-amber-50 text-amber-800 ring-amber-600/25", icon: AlertTriangle },
  error: { dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700 ring-rose-600/20", icon: XCircle },
  neutral: { dot: "bg-slate-400", badge: "bg-slate-100 text-slate-700 ring-slate-500/15", icon: Info },
};

/** Coloured status dot (decorative — always pair it with a HealthBadge or text). */
export function HealthDot({ tone, className }: { tone: HealthTone; className?: string }) {
  return <span className={cn("inline-block size-2 shrink-0 rounded-full", TONES[tone].dot, className)} aria-hidden />;
}

/** Status pill with icon + label, so the state never relies on colour alone. */
export function HealthBadge({ tone, label, className }: { tone: HealthTone; label: string; className?: string }) {
  const Icon = TONES[tone].icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone].badge,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </span>
  );
}
