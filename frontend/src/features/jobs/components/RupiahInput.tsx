import { useState, type ComponentProps } from "react";
import { Input } from "@/components/ui";
import { cn } from "@/utils/cn";
import { formatIdrNumber } from "@/utils/format";

export interface RupiahInputProps extends Omit<ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number | null;
  onChange: (value: number | null) => void;
}

/** Digits only -> number; "" -> null. */
function parseDigits(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  return digits === "" ? null : Number(digits);
}

/**
 * Whole-rupiah amount with an "Rp" prefix and Indonesian thousands separators ("12.000.000").
 * The form value stays a number (or null when empty).
 */
export function RupiahInput({ value, onChange, className, onBlur, ...props }: RupiahInputProps) {
  // Keep the raw text while typing so the caret doesn't jump; reformat on blur.
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (value === null ? "" : formatIdrNumber(value));
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400" aria-hidden>
        Rp
      </span>
      <Input
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(parseDigits(event.target.value));
        }}
        onBlur={(event) => {
          setDraft(null);
          onBlur?.(event);
        }}
        className={cn("pl-9 tabular-nums", className)}
      />
    </div>
  );
}
