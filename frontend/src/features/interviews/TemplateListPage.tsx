import { ClipboardList, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { DataTable, type DataTableColumn } from "@/components/tables/DataTable";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  FilterBar,
  FilterField,
  QueryState,
  SkeletonTable,
  StatusBadge,
  buttonClasses,
} from "@/components/ui";
import { JobSelect } from "@/features/jobs/components/JobSelect";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useTemplates } from "@/hooks/queries/interviews";
import type { InterviewTemplate } from "@/types/api";
import { formatDateTime, formatRelative } from "@/utils/format";
import { INTERVIEW_LANGUAGE_LABELS } from "@/utils/labels";
import { InterviewsSubNav } from "./components/InterviewsSubNav";

const columns: DataTableColumn<InterviewTemplate>[] = [
  {
    id: "name",
    header: "Template",
    cell: (template) => (
      <Link
        to={`/interviews/templates/${template.id}`}
        className="font-medium text-slate-900 hover:text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        {template.name}
      </Link>
    ),
  },
  {
    id: "job",
    header: "Job",
    cell: (template) => <span className="text-slate-700">{template.job_title}</span>,
    hideBelow: "md",
  },
  {
    id: "status",
    header: "Status",
    cell: (template) => (
      <div className="flex flex-col items-start gap-0.5">
        <StatusBadge kind="template" value={template.status} />
        {template.status === "approved" && template.approved_by ? (
          <span className="text-xs text-slate-500">by {template.approved_by}</span>
        ) : null}
      </div>
    ),
  },
  {
    id: "language",
    header: "Language",
    cell: (template) => (
      <Badge tone="info" size="sm">
        {INTERVIEW_LANGUAGE_LABELS[template.language] ?? template.language}
      </Badge>
    ),
    hideBelow: "md",
  },
  {
    id: "cv_questions",
    header: "CV questions",
    numeric: true,
    cell: (template) =>
      template.cv_questions > 0 ? (
        <span title={`${template.cv_questions} personalised questions generated from each candidate's CV, asked first`}>
          {template.cv_questions}
        </span>
      ) : (
        <span className="text-slate-400" title="No personalised CV questions">
          0
        </span>
      ),
    hideBelow: "sm",
  },
  {
    id: "competencies",
    header: "Competencies",
    numeric: true,
    cell: (template) => template.competencies.length,
    hideBelow: "sm",
  },
  {
    id: "questions",
    header: "Questions",
    numeric: true,
    cell: (template) => (
      <span title={`${template.num_questions} asked per interview from a bank of ${template.questions.length}`}>
        {template.questions.length}
      </span>
    ),
    hideBelow: "sm",
  },
  {
    id: "duration",
    header: "Duration",
    numeric: true,
    cell: (template) => `${template.duration_minutes} min`,
    hideBelow: "lg",
  },
  {
    id: "updated",
    header: "Updated",
    align: "right",
    cell: (template) => (
      <span className="whitespace-nowrap text-slate-600" title={formatDateTime(template.updated_at)}>
        {formatRelative(template.updated_at)}
      </span>
    ),
    hideBelow: "lg",
  },
];

function byUpdatedDesc(a: InterviewTemplate, b: InterviewTemplate): number {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
}

export function TemplateListPage() {
  useDocumentTitle("Interview templates");
  const navigate = useNavigate();
  const { getInt, setFilters } = useUrlFilters();
  const jobId = getInt("job_id");
  const query = useTemplates({ job_id: jobId });
  const newHref = jobId !== undefined ? `/interviews/templates/new?job_id=${jobId}` : "/interviews/templates/new";

  const newButton = (
    <Link to={newHref} className={buttonClasses({ variant: "primary" })}>
      <Plus aria-hidden />
      New template
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="AI Interviews"
        description="Competency-based interview templates per job: rubric, question bank and follow-up rules for the AI interviewer."
        actions={newButton}
      />
      <InterviewsSubNav active="templates" />

      <Alert tone="info" className="mb-6" title="Only approved templates can be used to invite candidates.">
        Editing an approved template moves it back to draft until it is approved again.
      </Alert>

      <Card className="overflow-hidden">
        <FilterBar>
          <FilterField label="Job" htmlFor="template-job-filter" className="lg:w-64">
            <JobSelect id="template-job-filter" value={jobId} onValueChange={(value) => setFilters({ job_id: value })} />
          </FilterField>
        </FilterBar>
        <QueryState
          query={query}
          loading={<SkeletonTable rows={5} columns={6} />}
          isEmpty={(templates) => templates.length === 0}
          empty={
            <EmptyState
              icon={ClipboardList}
              title={jobId !== undefined ? "No templates for this job yet" : "No interview templates yet"}
              description="Create a template for a job — start from an AI suggestion based on the job, then review the competencies, rubric and questions before approving it."
              action={newButton}
            />
          }
        >
          {(templates) => (
            <DataTable
              columns={columns}
              rows={[...templates].sort(byUpdatedDesc)}
              getRowKey={(template) => template.id}
              onRowClick={(template) => void navigate(`/interviews/templates/${template.id}`)}
              dimmed={query.isFetching && !query.isPending}
              caption="Interview templates"
            />
          )}
        </QueryState>
      </Card>
    </div>
  );
}
