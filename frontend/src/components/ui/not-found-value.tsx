import type { ReactNode } from "react";
import { cn } from "@/utils/cn";

export const NOT_FOUND_IN_CV = "Not found in CV";

/** Rendered wherever the CV extraction returned null. Never substitute an invented value. */
export function NotFoundInCv({ className, label = NOT_FOUND_IN_CV }: { className?: string; label?: string }) {
  return <span className={cn("text-sm italic text-slate-400", className)}>{label}</span>;
}

/** Renders `children` (or the value) when present, otherwise "Not found in CV". */
export function ValueOrNotFound({
  value,
  children,
  className,
}: {
  value: string | number | null | undefined;
  children?: ReactNode;
  className?: string;
}) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return <NotFoundInCv className={className} />;
  }
  return <span className={className}>{children ?? value}</span>;
}
