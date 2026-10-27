import { useId, type ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** On/off toggle (role="switch") with its label on the left. */
export function Switch({ checked, onCheckedChange, label, disabled, className }: SwitchProps) {
  const labelId = useId();
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span id={labelId} className="select-none text-sm text-slate-700">
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
          checked ? "bg-indigo-600" : "bg-slate-300",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-4 rounded-full bg-white shadow-sm transition-transform",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
    </span>
  );
}
