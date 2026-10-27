import type { ReactNode } from "react";
import { Table, TableContainer, TBody, TD, TH, THead, TR } from "@/components/ui";
import { cn } from "@/utils/cn";

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  /** Right-aligned tabular numbers. */
  numeric?: boolean;
  /** When set, the header becomes a sort button for this key. */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  /** Hide the column on small screens. */
  hideBelow?: "sm" | "md" | "lg";
}

export interface DataTableSort {
  key: string;
  direction: "asc" | "desc";
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string | number;
  /** Whole-row click (keep a real link in the primary cell for keyboard users). */
  onRowClick?: (row: T) => void;
  sort?: DataTableSort | null;
  onSortChange?: (key: string) => void;
  /** e.g. "max-h-[560px]" to scroll inside the card with a sticky header. */
  maxHeightClassName?: string;
  /** Previous data while refetching: dim instead of flashing skeletons. */
  dimmed?: boolean;
  caption?: string;
  rowClassName?: (row: T) => string | undefined;
}

const hideClass = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
} as const;

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  sort,
  onSortChange,
  maxHeightClassName,
  dimmed,
  caption,
  rowClassName,
}: DataTableProps<T>) {
  return (
    <TableContainer className={cn(maxHeightClassName, "transition-opacity", dimmed && "opacity-60")}>
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <THead>
          <tr>
            {columns.map((column) => (
              <TH
                key={column.id}
                align={column.align ?? (column.numeric ? "right" : "left")}
                sortable={Boolean(column.sortKey && onSortChange)}
                sortDirection={column.sortKey && sort?.key === column.sortKey ? sort.direction : null}
                onSort={column.sortKey && onSortChange ? () => onSortChange(column.sortKey as string) : undefined}
                className={cn(column.hideBelow && hideClass[column.hideBelow], column.headerClassName)}
              >
                {column.header}
              </TH>
            ))}
          </tr>
        </THead>
        <TBody>
          {rows.map((row) => (
            <TR
              key={getRowKey(row)}
              interactive={Boolean(onRowClick)}
              onClick={
                onRowClick
                  ? (event) => {
                      // Let inner links/buttons handle their own clicks.
                      if ((event.target as HTMLElement).closest("a,button,input,select,textarea,label")) return;
                      onRowClick(row);
                    }
                  : undefined
              }
              className={rowClassName?.(row)}
            >
              {columns.map((column) => (
                <TD
                  key={column.id}
                  align={column.align}
                  numeric={column.numeric}
                  className={cn(column.hideBelow && hideClass[column.hideBelow], column.className)}
                >
                  {column.cell(row)}
                </TD>
              ))}
            </TR>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  );
}
