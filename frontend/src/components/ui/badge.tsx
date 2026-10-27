import type { ComponentProps } from "react";
import { cn } from "@/utils/cn";

export type BadgeTone = "neutral" | "primary" | "success" | "danger" | "warning" | "info" | "violet" | "dark";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-500/15",
  primary: "bg-indigo-50 text-indigo-700 ring-indigo-600/20",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  danger: "bg-rose-50 text-rose-700 ring-rose-600/20",
  warning: "bg-amber-50 text-amber-800 ring-amber-600/25",
  info: "bg-sky-50 text-sky-700 ring-sky-600/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  dark: "bg-slate-800 text-white ring-slate-800",
};

export interface BadgeProps extends ComponentProps<"span"> {
  tone?: BadgeTone;
  size?: "sm" | "md";
}

export function Badge({ tone = "neutral", size = "md", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-md font-medium ring-1 ring-inset [&_svg]:size-3 [&_svg]:shrink-0",
        size === "sm" ? "px-1.5 py-px text-[11px]" : "px-2 py-0.5 text-xs",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Small pill for skills and tags. */
export function Chip({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700",
        className,
      )}
      {...props}
    />
  );
}
