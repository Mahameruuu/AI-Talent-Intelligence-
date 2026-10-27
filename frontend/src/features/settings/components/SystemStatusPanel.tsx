import {
  Activity,
  BookOpen,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  GitBranch,
  RefreshCw,
  ScanText,
  Sparkles,
  Tags,
  type LucideIcon,
} from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/tables/DataTable";
import { Alert, Button, Card, CardHeader, EmptyState, QueryState, Skeleton } from "@/components/ui";
import { useSystemStatus } from "@/hooks/queries/system";
import type { SystemStatus } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDateTime, formatRelative } from "@/utils/format";
import { healthSummary, systemHealthItems, type HealthComponentId, type HealthItem } from "../utils/system-health";
import { HealthBadge, HealthDot } from "./HealthBadge";

type Failure = SystemStatus["recent_failures"][number];

const ICONS: Record<HealthComponentId, LucideIcon> = {
  database: Database,
  llm: Sparkles,
  ocr: ScanText,
  embeddings: Brain,
  ner: Tags,
  taxonomy: BookOpen,
  worker: Cpu,
  pipeline: GitBranch,
};

const timeWithSeconds = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** System health: component status, worker queue and recent processing failures. */
export function SystemStatusPanel() {
  const statusQuery = useSystemStatus(true);
  const refreshing = statusQuery.isFetching && !statusQuery.isPending;

  return (
    <section aria-labelledby="system-status-heading" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="system-status-heading" className="text-base font-semibold text-slate-900">
            System status
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">Health of the CV screening pipeline. Refreshes every 30 seconds.</p>
        </div>
        <div className="flex items-center gap-3">
          {statusQuery.dataUpdatedAt > 0 ? (
            <p className="text-xs text-slate-500">
              Last updated{" "}
              <time dateTime={new Date(statusQuery.dataUpdatedAt).toISOString()} className="tabular-nums">
                {timeWithSeconds.format(statusQuery.dataUpdatedAt)}
              </time>
            </p>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<RefreshCw />}
            loading={refreshing}
            disabled={statusQuery.isPending}
            onClick={() => void statusQuery.refetch()}
          >
            Refresh
          </Button>
        </div>
      </div>

      <QueryState query={statusQuery} loading={<SystemStatusSkeleton />}>
        {(status) => <SystemStatusContent status={status} />}
      </QueryState>
    </section>
  );
}

function SystemStatusContent({ status }: { status: SystemStatus }) {
  const items = systemHealthItems(status);
  const summary = healthSummary(items);
  return (
    <div className="space-y-5">
      <Alert tone={summary.tone} title={summary.title}>
        {summary.description}
      </Alert>
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Components">
        {items.map((item) => (
          <li key={item.id} className="flex">
            <HealthCard item={item} />
          </li>
        ))}
      </ul>
      <RecentFailures failures={status.recent_failures} />
    </div>
  );
}

function HealthCard({ item }: { item: HealthItem }) {
  const Icon = ICONS[item.id];
  return (
    <Card className="flex w-full flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {item.tone ? <HealthDot tone={item.tone} /> : null}
          <Icon className="size-4 shrink-0 text-slate-400" aria-hidden />
          <h3 className="truncate text-sm font-semibold text-slate-900">{item.title}</h3>
        </div>
        {item.tone ? <HealthBadge tone={item.tone} label={item.statusLabel} /> : null}
      </div>
      {item.facts.length > 0 ? (
        <dl className="space-y-1.5 text-sm">
          {item.facts.map((fact) => (
            <div key={fact.label} className="flex items-baseline justify-between gap-3">
              <dt className="shrink-0 text-slate-500">{fact.label}</dt>
              <dd
                className={cn(
                  "min-w-0 truncate text-right font-medium tabular-nums text-slate-900",
                  fact.mono && "font-mono text-xs",
                )}
                title={fact.value}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {item.detail ? <p className="text-xs leading-relaxed text-slate-500">{item.detail}</p> : null}
    </Card>
  );
}

function RecentFailures({ failures }: { failures: Failure[] }) {
  const columns: DataTableColumn<Failure>[] = [
    {
      id: "document",
      header: "Document",
      cell: (row) => <span className="font-mono text-xs text-slate-600">#{row.document_id}</span>,
    },
    {
      id: "filename",
      header: "File",
      cell: (row) => (
        <span className="block max-w-56 truncate font-medium text-slate-900" title={row.filename}>
          {row.filename}
        </span>
      ),
    },
    {
      id: "code",
      header: "Error code",
      cell: (row) =>
        row.error_code ? (
          <code className="rounded bg-rose-50 px-1.5 py-0.5 font-mono text-xs text-rose-700">{row.error_code}</code>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      id: "message",
      header: "Message",
      hideBelow: "md",
      className: "min-w-56",
      cell: (row) => <span className="line-clamp-2 text-slate-600">{row.error_message ?? "—"}</span>,
    },
    {
      id: "at",
      header: "When",
      align: "right",
      cell: (row) => (
        <time dateTime={row.at} title={formatDateTime(row.at)} className="whitespace-nowrap text-slate-500">
          {formatRelative(row.at)}
        </time>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Recent processing failures"
        description="CVs that could not be processed by the NLP pipeline"
        icon={<Activity />}
      />
      {failures.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No recent failures"
          description="Every recent CV made it through the pipeline."
          compact
        />
      ) : (
        <DataTable
          columns={columns}
          rows={failures}
          getRowKey={(row) => `${row.document_id}-${row.at}`}
          caption="Recent processing failures"
          maxHeightClassName="max-h-96"
        />
      )}
    </Card>
  );
}

function SystemStatusSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading system status">
      <Skeleton className="h-14 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <Card key={index} className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
    </div>
  );
}
