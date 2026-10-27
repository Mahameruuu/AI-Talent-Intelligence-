import { Bot, ClipboardList, Lock, MessagesSquare, Pencil, Plus, RotateCcw, Trash2, TriangleAlert, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { DataTable, type DataTableColumn } from "@/components/tables/DataTable";
import {
  Button,
  buttonClasses,
  ConfirmDialog,
  DemoBadge,
  DropdownMenu,
  Skeleton,
  StatusBadge,
  useToast,
} from "@/components/ui";
import { formBuilderPath, useCreateFormAndOpen } from "@/features/application-forms/use-open-form-builder";
import { useSetJobStatus } from "@/hooks/queries/jobs";
import { getErrorMessage } from "@/services/api-client";
import type { ApplicationForm, Job } from "@/types/api";
import { formatDayTime, formatNumber, formatShortDateTimeWib, pluralize } from "@/utils/format";
import { cn } from "@/utils/cn";
import { EMPLOYMENT_TYPE_LABELS } from "@/utils/labels";
import { jobMetaLine } from "../job-utils";
import { DeleteJobDialog } from "./DeleteJobDialog";
import { UploadCvsDialog } from "./UploadCvsDialog";

/** Short status of a job's application period: opens soon / N days left / closes today / ended. */
function ApplicationPeriodBadge({ job }: { job: Job }) {
  if (!job.closes_on) return null;
  let badge: { label: string; className: string };
  if (job.application_window === "upcoming") {
    badge = { label: `Opens ${formatDayTime(job.opens_on, job.opens_time)}`, className: "bg-sky-50 text-sky-700 ring-sky-600/20" };
  } else if (job.application_window === "ended") {
    badge = { label: "Ended", className: "bg-slate-100 text-slate-600 ring-slate-500/20" };
  } else if (job.days_left === 0) {
    badge = { label: "Closes today", className: "bg-amber-50 text-amber-800 ring-amber-600/25" };
  } else {
    const left = job.days_left ?? 0;
    badge = {
      label: `${left} day${left === 1 ? "" : "s"} left`,
      className: left <= 7 ? "bg-amber-50 text-amber-800 ring-amber-600/25" : "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    };
  }
  return (
    <span className={`inline-flex rounded-md px-1.5 py-px text-[11px] font-medium ring-1 ring-inset ${badge.className}`}>
      {badge.label}
    </span>
  );
}

/** One muted line about the automatic AI-interview invitations of a job. */
function AutoInviteLine({ job }: { job: Job }) {
  const autoInvite = job.auto_invite;
  if (!autoInvite) return null;
  const line = "mt-1 flex items-center gap-1 text-xs [&_svg]:size-3.5 [&_svg]:shrink-0";
  switch (autoInvite.status) {
    case "scheduled":
      return (
        <p className={cn(line, "text-slate-500")}>
          <Bot aria-hidden />
          AI interview invites: {formatShortDateTimeWib(autoInvite.send_at)}
        </p>
      );
    case "sent":
      return (
        <p className={cn(line, "text-slate-500")}>
          <Bot aria-hidden />
          Invites sent · {formatNumber(autoInvite.invited_count ?? 0)}
        </p>
      );
    case "waiting_template":
      return (
        <Link
          to={`/interviews/templates?job_id=${job.id}`}
          className={cn(line, "text-amber-700 hover:underline")}
        >
          <TriangleAlert aria-hidden />
          Approve an interview template
        </Link>
      );
    case "no_deadline":
      return (
        <p className={cn(line, "text-slate-400")}>
          <Bot aria-hidden />
          Auto-invite needs a closing date
        </p>
      );
    case "failed":
      return (
        <p className={cn(line, "text-rose-700")} title={autoInvite.error ?? undefined}>
          <TriangleAlert aria-hidden />
          Auto-invite failed — retrying
        </p>
      );
    default:
      return null;
  }
}

/** Deadline with its period status, for the jobs table. */
function ApplicationPeriod({ job }: { job: Job }) {
  if (!job.closes_on) {
    return (
      <div className="whitespace-nowrap">
        <span className="text-slate-400">No deadline</span>
        <AutoInviteLine job={job} />
      </div>
    );
  }
  return (
    <div className="whitespace-nowrap">
      <p className="text-sm text-slate-900">Until {formatDayTime(job.closes_on, job.closes_time)}</p>
      <div className="mt-0.5">
        <ApplicationPeriodBadge job={job} />
      </div>
      <AutoInviteLine job={job} />
    </div>
  );
}

/** "No form" / "Draft" / "Live · 12 applications" / "Closed". */
function FormState({ form, status }: { form: ApplicationForm | undefined; status: FormsStatus }) {
  if (status === "pending") return <Skeleton className="h-5 w-14" />;
  if (status === "error") return <span className="text-slate-400">—</span>;
  if (!form) return <span className="whitespace-nowrap text-sm text-slate-400">No form</span>;
  return (
    <div className="flex flex-col items-start gap-0.5">
      <StatusBadge kind="form" value={form.status} size="sm" />
      {form.status !== "draft" ? (
        <span className="whitespace-nowrap text-xs text-slate-500">{pluralize(form.submission_count, "application")}</span>
      ) : null}
    </div>
  );
}

function applicantsPath(jobId: number): string {
  return `/candidates?job_id=${jobId}`;
}

type FormsStatus = "pending" | "error" | "success";

type PendingDialog = { kind: "delete" | "close" | "upload"; job: Job } | null;

export interface JobsTableProps {
  jobs: Job[];
  /** Application forms of all jobs, keyed by job id. */
  formsByJob: Map<number, ApplicationForm>;
  /** Status of the forms query: while unknown, no "Create form" button is offered. */
  formsStatus?: FormsStatus;
  dimmed?: boolean;
}

export function JobsTable({ jobs, formsByJob, formsStatus = "success", dimmed }: JobsTableProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const [dialog, setDialog] = useState<PendingDialog>(null);
  const setStatus = useSetJobStatus();
  const { create, pendingJobId } = useCreateFormAndOpen();

  const changeStatus = (job: Job, status: Job["status"]) =>
    setStatus.mutate(
      { id: job.id, status },
      {
        onSuccess: () => {
          setDialog(null);
          toast.success(status === "closed" ? "Job closed" : "Job reopened", job.title);
        },
        onError: (error) =>
          toast.error(status === "closed" ? "Couldn't close the job" : "Couldn't reopen the job", getErrorMessage(error)),
      },
    );

  const columns: DataTableColumn<Job>[] = [
    {
      id: "title",
      header: "Job",
      className: "min-w-52",
      cell: (job) => {
        const meta = [EMPLOYMENT_TYPE_LABELS[job.employment_type], jobMetaLine(job)].filter(Boolean).join(" · ");
        return (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link
                to={formBuilderPath(job.id)}
                className="font-medium text-slate-900 hover:text-indigo-700 hover:underline"
              >
                {job.title}
              </Link>
              {job.is_demo ? <DemoBadge /> : null}
            </div>
            {meta ? <p className="mt-0.5 truncate text-xs text-slate-500">{meta}</p> : null}
          </div>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      hideBelow: "sm",
      cell: (job) => <StatusBadge kind="job" value={job.status} />,
    },
    {
      id: "period",
      header: "Application period",
      hideBelow: "md",
      cell: (job) => <ApplicationPeriod job={job} />,
    },
    {
      id: "applicants",
      header: "Applicants",
      numeric: true,
      hideBelow: "sm",
      cell: (job) => (
        <Link
          to={applicantsPath(job.id)}
          className="font-medium text-slate-900 hover:text-indigo-700 hover:underline"
          aria-label={`${pluralize(job.candidate_count, "applicant")} for ${job.title}`}
        >
          {formatNumber(job.candidate_count)}
        </Link>
      ),
    },
    {
      id: "form",
      header: "Form",
      hideBelow: "md",
      cell: (job) => <FormState form={formsByJob.get(job.id)} status={formsStatus} />,
    },
    {
      id: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (job) => {
        const form = formsByJob.get(job.id);
        const closed = job.status === "closed";
        // A missing form is created in one click (not for closed jobs).
        const canCreate = formsStatus === "success" && !form && !closed;
        return (
          <div className="flex items-center justify-end gap-1">
            {canCreate ? (
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Plus />}
                onClick={() => create(job.id)}
                loading={pendingJobId === job.id}
                disabled={pendingJobId !== undefined}
                aria-label={`Create form for ${job.title}`}
              >
                Create form
              </Button>
            ) : (
              <Link
                to={formBuilderPath(job.id)}
                className={buttonClasses({ variant: "outline", size: "sm" })}
                aria-label={`Form for ${job.title}`}
              >
                <ClipboardList aria-hidden />
                Form
              </Link>
            )}
            <DropdownMenu
              label={`More actions for ${job.title}`}
              items={[
                { label: "Applicants", icon: <Users />, to: applicantsPath(job.id) },
                !closed && {
                  label: "Add candidates manually",
                  icon: <UserPlus />,
                  onSelect: () => setDialog({ kind: "upload", job }),
                },
                { label: "Interview templates", icon: <MessagesSquare />, to: `/interviews/templates?job_id=${job.id}` },
                { label: "Edit job", icon: <Pencil />, to: `/jobs/${job.id}/edit` },
                !closed && {
                  label: "Close job",
                  icon: <Lock />,
                  onSelect: () => setDialog({ kind: "close", job }),
                },
                closed && {
                  label: "Reopen job",
                  icon: <RotateCcw />,
                  disabled: setStatus.isPending,
                  onSelect: () => changeStatus(job, "open"),
                },
                {
                  label: "Delete job",
                  icon: <Trash2 />,
                  tone: "danger",
                  onSelect: () => setDialog({ kind: "delete", job }),
                },
              ]}
            />
          </div>
        );
      },
    },
  ];

  return (
    <>
      <DataTable
        columns={columns}
        rows={jobs}
        getRowKey={(job) => job.id}
        onRowClick={(job) => void navigate(formBuilderPath(job.id))}
        dimmed={dimmed}
        caption="Jobs"
      />
      {dialog?.kind === "delete" ? <DeleteJobDialog job={dialog.job} open onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "upload" ? <UploadCvsDialog job={dialog.job} open onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog
        open={dialog?.kind === "close"}
        onClose={() => setDialog(null)}
        onConfirm={() => dialog && changeStatus(dialog.job, "closed")}
        title="Close this job?"
        description="New applications and manual uploads stop. Candidates and interviews are kept, and you can reopen the job any time."
        confirmLabel="Close job"
        tone="danger"
        loading={setStatus.isPending}
      />
    </>
  );
}

