import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/utils/cn";

type Align = "left" | "right" | "center";

const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

/** Scroll container with a sticky header. Pass `maxHeight` to scroll vertically inside the card. */
export function TableContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("relative w-full overflow-auto scrollbar-thin", className)} {...props} />;
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return <table className={cn("w-full caption-bottom border-separate border-spacing-0 text-sm", className)} {...props} />;
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("sticky top-0 z-10 bg-slate-50", className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("[&>tr:last-child>td]:border-b-0", className)} {...props} />;
}

export interface TRProps extends ComponentProps<"tr"> {
  interactive?: boolean;
}

export function TR({ className, interactive, ...props }: TRProps) {
  return (
    <tr
      className={cn("transition-colors even:bg-slate-50/40 hover:bg-indigo-50/40", interactive && "cursor-pointer", className)}
      {...props}
    />
  );
}

export interface THProps extends ComponentProps<"th"> {
  align?: Align;
  sortable?: boolean;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
}

export function TH({ className, align = "left", sortable, sortDirection, onSort, children, ...props }: THProps) {
  const content: ReactNode = sortable ? (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        "inline-flex items-center gap-1 rounded hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40",
        align === "right" && "flex-row-reverse",
      )}
    >
      {children}
      {sortDirection === "asc" ? (
        <ArrowUp className="size-3.5" aria-hidden />
      ) : sortDirection === "desc" ? (
        <ArrowDown className="size-3.5" aria-hidden />
      ) : (
        <ArrowUpDown className="size-3.5 opacity-50" aria-hidden />
      )}
    </button>
  ) : (
    children
  );
  return (
    <th
      scope="col"
      aria-sort={sortDirection === "asc" ? "ascending" : sortDirection === "desc" ? "descending" : undefined}
      className={cn(
        "whitespace-nowrap border-b border-slate-200 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500",
        alignClass[align],
        className,
      )}
      {...props}
    >
      {content}
    </th>
  );
}

export interface TDProps extends ComponentProps<"td"> {
  align?: Align;
  numeric?: boolean;
}

export function TD({ className, align, numeric, ...props }: TDProps) {
  const resolved: Align = align ?? (numeric ? "right" : "left");
  return (
    <td
      className={cn(
        "border-b border-slate-100 px-4 py-3 align-middle text-slate-700",
        alignClass[resolved],
        numeric && "tabular-nums",
        className,
      )}
      {...props}
    />
  );
}
