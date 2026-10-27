import { cn } from "@/utils/cn";

export function Progress({ value, className, tone = "primary", label }: { value: number; className?: string; tone?: "primary" | "success" | "danger" | "warning"; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const toneClass = {
    primary: "bg-indigo-600",
    success: "bg-emerald-500",
    danger: "bg-rose-500",
    warning: "bg-amber-500",
  }[tone];
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-300", toneClass)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
