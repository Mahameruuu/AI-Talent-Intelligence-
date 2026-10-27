import { Briefcase, ClipboardList, FilterX, Info, Plus, Users } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  Card,
  EmptyState,
  FilterBar,
  FilterField,
  Pagination,
  QueryState,
  SearchInput,
  Select,
  SkeletonTable,
  buttonClasses,
} from "@/components/ui";
import { formBuilderPath } from "@/features/application-forms/use-open-form-builder";
import { JobSelect } from "@/features/jobs/components/JobSelect";
import { ShortlistWorkflow } from "@/features/shortlist/components/ShortlistWorkflow";
import { useShortlistSelection } from "@/features/shortlist/use-shortlist-selection";
import { useApplications } from "@/hooks/queries/candidates";
import { useJobOptions } from "@/hooks/queries/jobs";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { ApplicationListParams } from "@/services/candidates-api";
import { STAGE_LABELS, STAGE_ORDER } from "@/utils/labels";
import { MATCH_DISCLAIMER } from "@/utils/score";
import { isStage } from "./candidate-list-utils";
import { ApplicantsTable } from "./components/ApplicantsTable";
import { AutoInviteBar } from "./components/AutoInviteBar";

const PAGE_SIZE = 20;

/** /candidates — every applicant (one row per application) with their CV-screening result. */
export function CandidatesPage() {
  useDocumentTitle("Candidates");
  const { getString, getInt, setFilters, page } = useUrlFilters();

  const q = getString("q").trim();
  const jobId = getInt("job_id");
  const stageParam = getString("stage");
  const stage = isStage(stageParam) ? stageParam : undefined;
  const hasFilters = Boolean(q || jobId !== undefined || stage);

  const jobsQuery = useJobOptions();
  const jobs = jobsQuery.data?.items ?? [];
  const selectedJob = jobId === undefined ? undefined : jobs.find((job) => job.id === jobId);
  const noJobs = jobsQuery.isSuccess && jobsQuery.data.total === 0;

  const params: ApplicationListParams = {
    job_id: jobId,
    q: q || undefined,
    stage,
    // Within one job, rank by match score; across jobs, newest applications first.
    sort: jobId !== undefined ? "score" : "created",
    page,
    page_size: PAGE_SIZE,
  };
  const applicationsQuery = useApplications(params);
  const selection = useShortlistSelection(jobId);

  const clearFilters = () => setFilters({ q: undefined, job_id: undefined, stage: undefined });

  const emptyState = noJobs ? (
    <EmptyState
      icon={Briefcase}
      title="No jobs yet"
      description="Create a job with its requirements, then share its application form. Applicants and their CV-screening results appear here."
      action={
        <Link to="/jobs/new" className={buttonClasses()}>
          <Plus aria-hidden />
          Create a job
        </Link>
      }
    />
  ) : q || stage ? (
    <EmptyState
      icon={FilterX}
      title="No applicants match these filters"
      description="Try another name or email, or show all stages."
      action={
        <Button variant="secondary" onClick={() => setFilters({ q: undefined, stage: undefined })}>
          Clear search
        </Button>
      }
    />
  ) : (applicationsQuery.data?.total ?? 0) > 0 ? (
    <EmptyState
      icon={Users}
      title="Nothing on this page"
      action={
        <Button variant="secondary" onClick={() => setFilters({ page: 1 })}>
          Go to the first page
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={Users}
      title={selectedJob ? `No applicants for ${selectedJob.title} yet` : "No applicants yet"}
      description="Share the job's application form link. Each CV is screened against the job automatically and shows up here."
      action={
        <Link to={jobId !== undefined ? formBuilderPath(jobId) : "/jobs"} className={buttonClasses()}>
          <ClipboardList aria-hidden />
          {jobId !== undefined ? "Open application form" : "Go to jobs"}
        </Link>
      }
    />
  );

  return (
    <div>
      <PageHeader
        title="Candidates"
        description={
          <span className="inline-flex items-start gap-1.5">
            <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
            {MATCH_DISCLAIMER}
          </span>
        }
      />
      <Card>
        <FilterBar
          actions={
            hasFilters ? (
              <Button variant="ghost" size="sm" leftIcon={<FilterX />} onClick={clearFilters}>
                Clear
              </Button>
            ) : null
          }
        >
          <FilterField label="Job" htmlFor="candidates-job" className="lg:w-64">
            <JobSelect id="candidates-job" value={jobId} onValueChange={(value) => setFilters({ job_id: value })} />
          </FilterField>
          <FilterField label="Search" htmlFor="candidates-search" className="lg:w-72">
            <SearchInput
              id="candidates-search"
              value={q}
              onSearch={(value) => setFilters({ q: value.trim() || undefined })}
              placeholder="Name or email"
            />
          </FilterField>
          <FilterField label="Stage" htmlFor="candidates-stage">
            <Select
              id="candidates-stage"
              value={stage ?? ""}
              onChange={(event) => setFilters({ stage: event.target.value || undefined })}
            >
              <option value="">All stages</option>
              {STAGE_ORDER.map((value) => (
                <option key={value} value={value}>
                  {STAGE_LABELS[value]}
                </option>
              ))}
            </Select>
          </FilterField>
        </FilterBar>

        {selectedJob ? <AutoInviteBar key={selectedJob.id} job={selectedJob} /> : null}

        <QueryState
          query={applicationsQuery}
          loading={<SkeletonTable rows={8} columns={6} />}
          isEmpty={(data) => data.items.length === 0}
          empty={emptyState}
        >
          {(data) => {
            const content = (
              <>
                <ApplicantsTable
                  applications={data.items}
                  showJob={jobId === undefined}
                  showScreeningQuestions={data.items.some((item) => (item.screening_summary?.screening_total ?? 0) > 0)}
                  selection={selectedJob ? selection : undefined}
                  dimmed={applicationsQuery.isPlaceholderData}
                  caption={selectedJob ? `Applicants for ${selectedJob.title}, highest match score first` : "Applicants, newest first"}
                />
                <Pagination
                  page={data.page}
                  pageSize={data.page_size || PAGE_SIZE}
                  total={data.total}
                  onPageChange={(next) => setFilters({ page: next })}
                />
              </>
            );
            return selectedJob ? (
              <ShortlistWorkflow job={selectedJob} selection={selection}>
                {content}
              </ShortlistWorkflow>
            ) : (
              content
            );
          }}
        </QueryState>
      </Card>
    </div>
  );
}
