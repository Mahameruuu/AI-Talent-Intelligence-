import { Search, X } from "lucide-react";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/utils/cn";
import { controlClasses } from "./input";

/** One row of filters above a table or chart grid. */
export function FilterBar({ children, className, actions }: { children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-3 border-b border-slate-100 px-4 py-3 lg:flex-row lg:items-end", className)}>
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Small labelled wrapper for a filter control. */
export function FilterField({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 lg:w-44", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}

export interface SearchInputProps extends Omit<ComponentProps<"input">, "value" | "onChange"> {
  value: string;
  /** Called with the debounced value. */
  onSearch: (value: string) => void;
  debounceMs?: number;
}

/** Debounced search box with a clear button. */
export function SearchInput({ value, onSearch, debounceMs = 300, className, placeholder = "Search…", ...props }: SearchInputProps) {
  const [draft, setDraft] = useState(value);
  const debounced = useDebouncedValue(draft, debounceMs);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (debounced !== value) onSearch(debounced);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to the debounced draft
  }, [debounced]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        className={cn(controlClasses, "h-9 pl-9 pr-8 [&::-webkit-search-cancel-button]:hidden")}
        {...props}
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onSearch("");
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Clear search"
        >
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
