import type { ComponentProps } from "react";
import { cn } from "@/utils/cn";

export const controlClasses =
  "w-full rounded-lg border border-slate-300 bg-white text-sm text-slate-900 shadow-xs transition-colors " +
  "placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-3 focus:ring-indigo-500/15 " +
  "disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 " +
  "aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-500/15";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cn(controlClasses, "h-9 px-3", className)} {...props} />;
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(controlClasses, "min-h-20 px-3 py-2 leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium text-slate-700", className)} {...props} />;
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 rounded border-slate-300 text-indigo-700 accent-indigo-700 focus:ring-2 focus:ring-indigo-500/30",
        className,
      )}
      {...props}
    />
  );
}
