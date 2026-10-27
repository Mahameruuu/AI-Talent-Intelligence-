import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/utils/cn";

export interface CollapsibleProps {
  title: ReactNode;
  description?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}

export function Collapsible({ title, description, defaultOpen = false, children, className, actions }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white", className)}>
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-3 text-left hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/40"
        >
          <ChevronDown
            className={cn("size-4 shrink-0 text-slate-400 transition-transform", open ? "rotate-0" : "-rotate-90")}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-900">{title}</span>
            {description ? <span className="block text-xs text-slate-500">{description}</span> : null}
          </span>
        </button>
        {actions}
      </div>
      {open ? (
        <div id={contentId} className="border-t border-slate-100 px-4 py-4">
          {children}
        </div>
      ) : null}
    </div>
  );
}
