import { FilterX, MessagesSquare } from "lucide-react";
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
  Select,
  SkeletonTable,
  buttonClasses,
} from "@/components/ui";
import { JobSelect } from "@/features/jobs/components/JobSelect";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { useInterviews } from "@/hooks/queries/interviews";
import { InterviewSessionsTable } from "./components/InterviewSessionsTable";
import { InterviewsSubNav } from "./components/InterviewsSubNav";
import { INTERVIEW_STATUS_OPTIONS, isInterviewStatus } from "./interview-utils";

const PAGE_SIZE = 20;

export function InterviewListPage() {
  useDocumentTitle("AI Interviews");
  const { getString, getInt, setFilters, page } = useUrlFilters();

  const rawStatus = getString("status");
  const status = isInterviewStatus(rawStatus) ? rawStatus : undefined;
  const jobId = getInt("job_id");
  const hasFilters = status !== undefined || jobId !== undefined;

  const query = useInterviews({ status, job_id: jobId, page, page_size: PAGE_SIZE });

  return (
    <div>
      <PageHeader
        title="AI Interviews"
        description="Track candidate interview sessions, read transcripts and review AI-assisted evaluations."
      />
      <InterviewsSubNav active="sessions" />

      <Card className="overflow-hidden">
        <FilterBar
          actions={
            hasFilters ? (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<FilterX />}
                onClick={() => setFilters({ status: undefined, job_id: undefined })}
              >
                Clear filters
              </Button>
            ) : null
          }
        >
          <FilterField label="Status" htmlFor="interview-status-filter">
            <Select
              id="interview-status-filter"
              value={status ?? ""}
              onChange={(event) => setFilters({ status: event.target.value || undefined })}
              placeholder="All statuses"
              options={INTERVIEW_STATUS_OPTIONS}
            />
          </FilterField>
          <FilterField label="Job" htmlFor="interview-job-filter" className="lg:w-60">
            <JobSelect id="interview-job-filter" value={jobId} onValueChange={(value) => setFilters({ job_id: value })} />
          </FilterField>
        </FilterBar>

        <QueryState
          query={query}
          loading={<SkeletonTable rows={8} columns={6} />}
          isEmpty={(data) => data.items.length === 0 && data.total === 0}
          empty={
            hasFilters ? (
              <EmptyState
                icon={FilterX}
                title="No interviews match these filters"
                description="Try another status or job, or clear the filters to see every interview session."
                action={
                  <Button variant="secondary" onClick={() => setFilters({ status: undefined, job_id: undefined })}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={MessagesSquare}
                title="No interviews yet"
                description={
                  <>
                    Shortlist the top candidates on a job page (or on the Candidates page filtered by job) and invite them
                    in one go, or invite one candidate from their candidate page.
                    Each invitation needs an approved interview template and produces a private link, emailed to the
                    candidate.
                  </>
                }
                action={
                  <>
                    <Link to="/candidates" className={buttonClasses({ variant: "secondary" })}>
                      Go to candidates
                    </Link>
                    <Link to="/interviews/templates" className={buttonClasses({ variant: "primary" })}>
                      Set up a template
                    </Link>
                  </>
                }
              />
            )
          }
        >
          {(data) => (
            <>
              <InterviewSessionsTable sessions={data.items} dimmed={query.isPlaceholderData} />
              <Pagination
                page={data.page}
                pageSize={data.page_size || PAGE_SIZE}
                total={data.total}
                onPageChange={(next) => setFilters({ page: next })}
              />
            </>
          )}
        </QueryState>
      </Card>
    </div>
  );
}
