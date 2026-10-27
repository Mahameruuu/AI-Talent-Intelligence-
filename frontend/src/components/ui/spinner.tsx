import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className="inline-flex items-center">
      <Loader2 className={cn("size-4 animate-spin text-indigo-600", className)} aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}
