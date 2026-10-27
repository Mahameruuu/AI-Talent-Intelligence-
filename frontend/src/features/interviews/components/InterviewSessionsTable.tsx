import { ArrowRight, ClipboardCheck } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { DataTable, type DataTableColumn } from "@/components/tables/DataTable";
import { Badge, StatusBadge, buttonClasses } from "@/components/ui";
import type { InterviewSession } from "@/types/api";
import { formatDate, formatDateTime, formatRelative } from "@/utils/format";
import { SessionProgress } from "./SessionProgress";

export interface InterviewSessionsTableProps {
  sessions: InterviewSession[];
  dimmed?: boolean;
  showCandidate?: boolean;
  showJob?: boolean;
}

function SessionDates({ session }: { session: InterviewSession }) {
  let secondary: { label: string; value: string | null } | null = null;
  if (session.status === "pending" || session.status === "in_progress") {
    secondary = { label: "Expires", value: session.expires_at };
  } else if (session.status === "completed") {
    secondary = { label: "Completed", value: session.completed_at };
  } else if (session.status === "expired") {
    secondary = { label: "Expired", value: session.expires_at };
  }
  return (
    <div className="flex flex-col gap-0.5 whitespace-nowrap">
      <span className="text-slate-700" title={formatDateTime(session.created_at)}>
        Invited {formatDate(session.created_at)}
      </span>
      {secondary?.value ? (
        <span className="text-xs text-slate-500" title={formatDateTime(secondary.value)}>
          {secondary.label} {formatRelative(secondary.value)}
        </span>
      ) : null}
    </div>
  );
}

/** Interview sessions list, shared by the Interviews page and the candidate detail "Interviews" tab. */
export function InterviewSessionsTable({ sessions, dimmed, showCandidate = true, showJob = true }: InterviewSessionsTableProps) {
  const navigate = useNavigate();

  const columns: DataTableColumn<InterviewSession>[] = [];

  if (showCandidate) {
    columns.push({
      id: "candidate",
      header: "Candidate",
      cell: (session) => (
        <Link
          to={`/interviews/${session.id}`}
          className="font-medium text-slate-900 hover:text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        >
          {session.candidate_name}
        </Link>
      ),
    });
  }

  if (showJob) {
    columns.push({
      id: "job",
      header: "Job",
      cell: (session) => <span className="text-slate-700">{session.job_title}</span>,
      hideBelow: showCandidate ? "md" : undefined,
    });
  }

  columns.push(
    {
      id: "template",
      header: "Template",
      cell: (session) =>
        showCandidate || showJob ? (
          <span className="text-slate-600">{session.template_name}</span>
        ) : (
          <Link
            to={`/interviews/${session.id}`}
            className="font-medium text-slate-900 hover:text-indigo-700 hover:underline"
          >
            {session.template_name}
          </Link>
        ),
      hideBelow: showCandidate || showJob ? "lg" : undefined,
    },
    {
      id: "status",
      header: "Status",
      cell: (session) => <StatusBadge kind="interview" value={session.status} />,
    },
    {
      id: "progress",
      header: "Progress",
      cell: (session) => <SessionProgress session={session} className="w-28" />,
      hideBelow: "sm",
    },
    {
      id: "evaluation",
      header: "Evaluation",
      cell: (session) =>
        session.evaluation_status ? (
          <StatusBadge kind="evaluation" value={session.evaluation_status} />
        ) : (
          <span className="text-slate-400" aria-label="No evaluation">
            —
          </span>
        ),
      hideBelow: "md",
    },
    {
      id: "decision",
      header: "Decision",
      cell: (session) =>
        session.application_decision === "accepted" ? (
          <Badge tone="success">Accepted</Badge>
        ) : session.application_decision === "rejected" ? (
          <Badge tone="danger">Rejected</Badge>
        ) : (
          <span className="text-slate-400" aria-label="No decision">
            —
          </span>
        ),
    },
    {
      id: "email",
      header: "Email",
      cell: (session) =>
        session.invitation_email ? (
          <span
            title={`${session.invitation_email.to_email} · ${formatDateTime(session.invitation_email.created_at)}${
              session.invitation_email.error ? `\n${session.invitation_email.error}` : ""
            }`}
          >
            <StatusBadge kind="email" value={session.invitation_email.status} size="sm" />
          </span>
        ) : (
          <span className="text-slate-400" aria-label="Not emailed">
            —
          </span>
        ),
      hideBelow: "lg",
    },
    {
      id: "dates",
      header: "Dates",
      cell: (session) => <SessionDates session={session} />,
      hideBelow: "lg",
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (session) => (
        <div className="flex items-center justify-end gap-1">
          {session.evaluation_status !== null ? (
            <Link
              to={`/interviews/${session.id}/evaluation`}
              className={buttonClasses({ variant: "ghost", size: "sm" })}
              aria-label={`View evaluation for ${session.candidate_name}`}
            >
              <ClipboardCheck aria-hidden />
              <span className="hidden xl:inline">Evaluation</span>
            </Link>
          ) : null}
          <Link
            to={`/interviews/${session.id}`}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
            aria-label={`View interview details for ${session.candidate_name}`}
          >
            <span className="hidden xl:inline">Details</span>
            <ArrowRight aria-hidden />
          </Link>
        </div>
      ),
    },
  );

  return (
    <DataTable
      columns={columns}
      rows={sessions}
      getRowKey={(session) => session.id}
      onRowClick={(session) => void navigate(`/interviews/${session.id}`)}
      dimmed={dimmed}
      caption="Interview sessions"
    />
  );
}
