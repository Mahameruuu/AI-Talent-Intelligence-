import { ArrowRight } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { DataTable, type DataTableColumn } from "@/components/tables/DataTable";
import { Card, CardHeader, ScoreBadge, StatusBadge, buttonClasses } from "@/components/ui";
import type { DashboardJobRow } from "@/types/api";
import { formatDay, formatNumber } from "@/utils/format";
import { candidatesHref } from "../dashboard-utils";

function Deadline({ row }: { row: DashboardJobRow }) {
  const closes = row.status === "open" ? (row.closes_on ? `Closes ${formatDay(row.closes_on)}` : "No deadline") : null;
  return (
    <div className="space-y-0.5 whitespace-nowrap">
      <StatusBadge kind="job" value={row.status} size="sm" />
      {closes ? <p className="text-xs text-slate-500">{closes}</p> : null}
      {row.auto_invite_on ? (
        <p className="text-xs text-slate-500">Auto-invite {formatDay(row.auto_invite_on)}</p>
      ) : null}
    </div>
  );
}

const columns: DataTableColumn<DashboardJobRow>[] = [
  {
    id: "job",
    header: "Job",
    className: "min-w-44",
    cell: (row) => (
      <Link
        to={candidatesHref(row.job_id)}
        className="font-medium text-slate-900 hover:text-indigo-700 hover:underline"
        onClick={(event) => event.stopPropagation()}
      >
        {row.title}
      </Link>
    ),
  },
  { id: "applicants", header: "Applicants", numeric: true, cell: (row) => formatNumber(row.applicants) },
  {
    id: "score",
    header: "Avg. match",
    align: "right",
    cell: (row) => <ScoreBadge score={row.avg_match_score} size="sm" />,
  },
  { id: "interviewed", header: "Interviewed", numeric: true, cell: (row) => formatNumber(row.interviewed) },
  { id: "hired", header: "Hired", numeric: true, cell: (row) => formatNumber(row.hired) },
  { id: "status", header: "Status", cell: (row) => <Deadline row={row} /> },
];

export function JobsOverviewCard({ jobs, totalJobs }: { jobs: DashboardJobRow[]; totalJobs: number }) {
  const navigate = useNavigate();
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title="Jobs overview"
        description={
          totalJobs > jobs.length ? `Showing ${jobs.length} of ${formatNumber(totalJobs)} jobs` : "Your jobs at a glance"
        }
        actions={
          <Link to="/jobs" className={buttonClasses({ variant: "ghost", size: "sm" })}>
            View all jobs
            <ArrowRight aria-hidden />
          </Link>
        }
      />
      {jobs.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No jobs yet.</p>
      ) : (
        <DataTable
          columns={columns}
          rows={jobs}
          getRowKey={(row) => row.job_id}
          onRowClick={(row) => navigate(candidatesHref(row.job_id))}
          caption="Jobs overview"
        />
      )}
    </Card>
  );
}
