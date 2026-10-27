import { FilterX, Mail, MailWarning } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/tables/DataTable";
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FilterBar,
  FilterField,
  QueryState,
  Select,
  SkeletonTable,
  StatusBadge,
  getStatusLabel,
} from "@/components/ui";
import { useEmailLogs } from "@/hooks/queries/interviews";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { EmailLogEntry, EmailStatus } from "@/types/api";
import { formatDateTime, formatRelative, humanize } from "@/utils/format";
import { InterviewsSubNav } from "./components/InterviewsSubNav";

const EMAIL_STATUSES: EmailStatus[] = ["sent", "failed", "not_configured"];
const STATUS_OPTIONS = EMAIL_STATUSES.map((value) => ({ value, label: getStatusLabel("email", value) }));

function isEmailStatus(value: string): value is EmailStatus {
  return (EMAIL_STATUSES as string[]).includes(value);
}

const columns: DataTableColumn<EmailLogEntry>[] = [
  {
    id: "recipient",
    header: "Recipient",
    cell: (entry) => <span className="font-medium text-slate-900">{entry.to_email}</span>,
  },
  {
    id: "subject",
    header: "Subject",
    className: "min-w-56",
    hideBelow: "md",
    cell: (entry) => (
      <div className="min-w-0">
        <p className="line-clamp-2 text-slate-700">{entry.subject}</p>
        <p className="text-xs text-slate-400">{humanize(entry.kind)}</p>
      </div>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (entry) => <StatusBadge kind="email" value={entry.status} />,
  },
  {
    id: "error",
    header: "Error",
    hideBelow: "lg",
    className: "min-w-48",
    cell: (entry) =>
      entry.error ? (
        <span className="line-clamp-2 text-xs text-rose-700" title={entry.error}>
          {entry.error}
        </span>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    id: "session",
    header: "Interview",
    hideBelow: "sm",
    cell: (entry) =>
      entry.session_id !== null ? (
        <Link to={`/interviews/${entry.session_id}`} className="text-xs font-semibold text-indigo-700 hover:underline">
          Session #{entry.session_id}
        </Link>
      ) : (
        <span className="text-slate-400">—</span>
      ),
  },
  {
    id: "time",
    header: "Time",
    align: "right",
    cell: (entry) => (
      <time dateTime={entry.created_at} title={formatDateTime(entry.created_at)} className="whitespace-nowrap text-slate-500">
        {formatRelative(entry.created_at)}
      </time>
    ),
  },
];

function byNewest(a: EmailLogEntry, b: EmailLogEntry): number {
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/** /interviews/emails — outgoing invitation emails. */
export function EmailLogPage() {
  useDocumentTitle("Email log");
  const { getString, setFilters } = useUrlFilters();
  const rawStatus = getString("status");
  const status = isEmailStatus(rawStatus) ? rawStatus : undefined;
  const query = useEmailLogs();

  const entries = useMemo(() => [...(query.data ?? [])].sort(byNewest), [query.data]);
  const filtered = status ? entries.filter((entry) => entry.status === status) : entries;
  // The latest attempt tells whether SMTP is configured right now.
  const smtpMissing = entries[0]?.status === "not_configured";

  return (
    <div>
      <PageHeader
        title="AI Interviews"
        description="Invitation emails sent to candidates. Message bodies are stored with the private links redacted."
      />
      <InterviewsSubNav active="emails" />

      {smtpMissing ? (
        <Alert tone="warning" icon={MailWarning} className="mb-6" title="Email (SMTP) isn't configured on the server">
          Invitations are still created, but no emails are sent: copy each invitation link when you create it and share
          it with the candidate yourself. An administrator can enable email by setting <code>SMTP_HOST</code> and{" "}
          <code>MAIL_FROM</code> on the backend.
        </Alert>
      ) : null}

      <Card className="overflow-hidden">
        <FilterBar
          actions={
            status ? (
              <Button variant="ghost" size="sm" leftIcon={<FilterX />} onClick={() => setFilters({ status: undefined })}>
                Clear filter
              </Button>
            ) : null
          }
        >
          <FilterField label="Status" htmlFor="email-status-filter">
            <Select
              id="email-status-filter"
              value={status ?? ""}
              onChange={(event) => setFilters({ status: event.target.value || undefined })}
              placeholder="All statuses"
              options={STATUS_OPTIONS}
            />
          </FilterField>
        </FilterBar>
        <QueryState
          query={query}
          loading={<SkeletonTable rows={6} columns={5} />}
          isEmpty={() => filtered.length === 0}
          empty={
            status ? (
              <EmptyState
                icon={FilterX}
                title="No emails with this status"
                action={
                  <Button variant="secondary" onClick={() => setFilters({ status: undefined })}>
                    Show all emails
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Mail}
                title="No emails sent yet"
                description="Invitation emails appear here when you invite candidates to the AI interview with “Send invitation email” turned on."
              />
            )
          }
        >
          {() => (
            <DataTable
              columns={columns}
              rows={filtered}
              getRowKey={(entry) => entry.id}
              dimmed={query.isFetching && !query.isPending}
              caption="Email log"
            />
          )}
        </QueryState>
      </Card>
    </div>
  );
}
