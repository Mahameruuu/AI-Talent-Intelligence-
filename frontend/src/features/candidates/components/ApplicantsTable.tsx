import { AlertTriangle, Eye, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { DataTable, type DataTableColumn } from "@/components/tables/DataTable";
import { Badge, Checkbox, DemoBadge, DropdownMenu, ScoreBadge, Spinner, StatusBadge } from "@/components/ui";
import { isShortlistable, applicationScore } from "@/features/shortlist/shortlist-utils";
import { toRecipient, type ShortlistSelection } from "@/features/shortlist/use-shortlist-selection";
import { isDocumentProcessing } from "@/hooks/queries/shared";
import type { Application } from "@/types/api";
import { formatDate, formatDateTime } from "@/utils/format";
import { applicantEmail, applicantHref, matchCategory } from "../candidate-list-utils";
import { DeleteCandidateDialog } from "./DeleteCandidateDialog";

function Dash({ title }: { title?: string }) {
  return (
    <span className="text-slate-400" title={title}>
      —
    </span>
  );
}

function MatchScoreCell({ application }: { application: Application }) {
  if (isDocumentProcessing(application.latest_document?.status)) {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-sky-700">
        <Spinner className="size-3.5 text-sky-600" label="CV is being processed" />
        Processing…
      </span>
    );
  }
  const score = application.screening_summary ? applicationScore(application) : null;
  if (score === null) return <Dash title="Not screened yet" />;
  return (
    <span className="inline-flex items-center justify-end gap-2 whitespace-nowrap">
      <span className="text-xs text-slate-500">{matchCategory(score)}</span>
      <ScoreBadge score={score} size="sm" />
    </span>
  );
}

function RequiredSkillsCell({ application }: { application: Application }) {
  const summary = application.screening_summary;
  if (!summary || summary.required_total === 0) return <Dash />;
  const { required_matched: matched, required_total: total } = summary;
  return (
    <span
      className="whitespace-nowrap text-sm tabular-nums"
      title={`${matched} of ${total} required skills found in the CV`}
    >
      <span className={matched === total ? "font-semibold text-emerald-700" : "font-semibold text-slate-900"}>{matched}</span>
      <span className="text-slate-400">/{total}</span>
    </span>
  );
}

function ScreeningQuestionsCell({ application }: { application: Application }) {
  const summary = application.screening_summary;
  if (!summary || summary.screening_total === 0) return <Dash />;
  const { screening_met: met, screening_total: total } = summary;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 whitespace-nowrap">
      <span className="text-sm tabular-nums" title={`${met} of ${total} screening questions answered as expected`}>
        <span className="font-semibold text-slate-900">{met}</span>
        <span className="text-slate-400">/{total}</span>
      </span>
      {summary.knockout_failed ? (
        <Badge size="sm" tone="warning" title="A must-meet screening question was not met. Flagged for HR — never rejected automatically.">
          <AlertTriangle aria-hidden />
          Knockout
        </Badge>
      ) : null}
    </span>
  );
}

export interface ApplicantsTableProps {
  applications: Application[];
  /** Hide the Job column when the table is filtered to one job. */
  showJob: boolean;
  /** Show the screening-questions column (only useful when some job has them). */
  showScreeningQuestions: boolean;
  /** Shortlist selection (when one job is selected). */
  selection?: ShortlistSelection;
  dimmed?: boolean;
  caption: string;
}

/** One row per application (one applicant for one job) with the CV-screening outcome. */
export function ApplicantsTable({
  applications,
  showJob,
  showScreeningQuestions,
  selection,
  dimmed,
  caption,
}: ApplicantsTableProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [deleting, setDeleting] = useState<Application | null>(null);
  // Remember the filtered list so the detail page can return to it (e.g. after deleting the candidate).
  const linkState = { from: `${location.pathname}${location.search}` };
  const open = (application: Application) => void navigate(applicantHref(application), { state: linkState });
  const eligible = applications.filter(isShortlistable);
  const allEligibleSelected = selection !== undefined && eligible.length > 0 && eligible.every((item) => selection.isSelected(item.id));

  const columns: DataTableColumn<Application>[] = [];
  if (selection) {
    columns.push({
      id: "select",
      header: (
        <Checkbox
          aria-label="Select all candidates in Applied or Screening on this page"
          checked={allEligibleSelected}
          disabled={eligible.length === 0}
          onChange={() => selection.setMany(eligible.map(toRecipient), !allEligibleSelected)}
        />
      ),
      className: "w-10",
      cell: (application) =>
        isShortlistable(application) ? (
          <Checkbox
            aria-label={`Select ${application.candidate_name}`}
            checked={selection.isSelected(application.id)}
            onChange={() => selection.toggle(toRecipient(application))}
          />
        ) : (
          <Checkbox aria-label={`${application.candidate_name} is already ${application.stage}`} checked={false} disabled readOnly />
        ),
    });
  }
  columns.push({
    id: "candidate",
    header: "Candidate",
    className: "min-w-48",
    cell: (application) => {
      const email = applicantEmail(application);
      return (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link
              to={applicantHref(application)}
              state={linkState}
              className="truncate font-medium text-slate-900 hover:text-indigo-700 hover:underline"
            >
              {application.candidate_name}
            </Link>
            {application.is_demo ? <DemoBadge /> : null}
          </div>
          {email ? <p className="max-w-64 truncate text-xs text-slate-500">{email}</p> : null}
        </div>
      );
    },
  });
  if (showJob) {
    columns.push({
      id: "job",
      header: "Job",
      hideBelow: "md",
      cell: (application) => (
        <span className="block max-w-48 truncate text-slate-700" title={application.job_title}>
          {application.job_title}
        </span>
      ),
    });
  }
  columns.push(
    {
      id: "score",
      header: "Match score",
      numeric: true,
      cell: (application) => <MatchScoreCell application={application} />,
    },
    {
      id: "required",
      header: "Required skills",
      numeric: true,
      hideBelow: "sm",
      cell: (application) => <RequiredSkillsCell application={application} />,
    },
  );
  if (showScreeningQuestions) {
    columns.push({
      id: "screening",
      header: "Screening questions",
      hideBelow: "md",
      cell: (application) => <ScreeningQuestionsCell application={application} />,
    });
  }
  columns.push(
    {
      id: "stage",
      header: "Stage",
      cell: (application) => <StatusBadge kind="stage" value={application.stage} size="sm" />,
    },
    {
      id: "applied",
      header: "Applied",
      hideBelow: "lg",
      cell: (application) => {
        const at = application.submitted_at ?? application.created_at;
        return (
          <span className="whitespace-nowrap text-xs text-slate-500" title={formatDateTime(at)}>
            {formatDate(at)}
          </span>
        );
      },
    },
  );

  columns.push({
    id: "actions",
    header: <span className="sr-only">Actions</span>,
    align: "right",
    className: "w-10 px-2",
    headerClassName: "w-10 px-2",
    cell: (application) => (
      <DropdownMenu
        label={`Actions for ${application.candidate_name}`}
        items={[
          { label: "View", icon: <Eye />, onSelect: () => open(application) },
          {
            label: "Delete",
            icon: <Trash2 />,
            tone: "danger",
            onSelect: () => setDeleting(application),
          },
        ]}
      />
    ),
  });

  return (
    <>
      <DataTable
        columns={columns}
        rows={applications}
        getRowKey={(application) => application.id}
        onRowClick={open}
        dimmed={dimmed}
        caption={caption}
        rowClassName={(application) => (selection?.isSelected(application.id) ? "bg-indigo-50/60" : undefined)}
      />
      {deleting ? (
        <DeleteCandidateDialog
          open
          onClose={() => setDeleting(null)}
          candidateId={deleting.candidate_id}
          candidateName={deleting.candidate_name}
          application={{ id: deleting.id, jobTitle: deleting.job_title }}
          defaultScope="application"
          onDeleted={() => {
            if (selection?.isSelected(deleting.id)) selection.toggle(toRecipient(deleting));
          }}
        />
      ) : null}
    </>
  );
}
