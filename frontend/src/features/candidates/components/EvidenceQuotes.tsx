import type { Evidence } from "@/types/api";
import { cn } from "@/utils/cn";

export interface EvidenceQuotesProps {
  evidence: Evidence[];
  /** Max quotes before collapsing into "+N more". */
  max?: number;
  className?: string;
}

/** What the CV says, as plain quoted excerpts. */
export function EvidenceQuotes({ evidence, max = 2, className }: EvidenceQuotesProps) {
  if (evidence.length === 0) return null;
  const visible = evidence.slice(0, max);
  const hidden = evidence.length - visible.length;
  return (
    <ul className={cn("space-y-1", className)} aria-label="Quoted from the CV">
      {visible.map((item, index) => (
        <li key={`${index}-${item.text}`}>
          <blockquote className="border-l-2 border-slate-200 pl-2.5 text-xs italic leading-relaxed text-slate-600">
            “{item.text.trim()}”
          </blockquote>
        </li>
      ))}
      {hidden > 0 ? <li className="pl-3 text-[11px] text-slate-400">+{hidden} more from the CV</li> : null}
    </ul>
  );
}
