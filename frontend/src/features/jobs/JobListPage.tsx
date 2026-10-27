import { Briefcase, Plus, SearchX } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Button,
  buttonClasses,
  Card,
  EmptyState,
  FilterBar,
  FilterField,
  Pagination,
  QueryState,
  SearchInput,
  SkeletonTable,
} from "@/components/ui";
import { useApplicationForms } from "@/hooks/queries/forms";
import { useJobs } from "@/hooks/queries/jobs";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useUrlFilters } from "@/hooks/use-url-filters";
import type { JobStatus } from "@/types/api";
import { JobsTable } from "./components/JobsTable";
import { SegmentedControl, type SegmentedOption } from "./components/SegmentedControl";
import { isJobStatus } from "./job-utils";

const PAGE_SIZE = 20;

const STATUS_OPTIONS: SegmentedOption<JobStatus | "all">[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

export function JobListPage() {
  useDocumentTitle("Jobs");
  const { getString, setFilters, page } = useUrlFilters();
  const rawQ = getString("q");
  const q = rawQ.trim();
  const statusParam = getString("status");
  const status = isJobStatus(statusParam) ? statusParam : undefined;
  const hasFilters = Boolean(q || status);

  const jobsQuery = useJobs({ q: q || undefined, status, page, page_size: PAGE_SIZE });
  // One request for every job's form (no per-row fetches).
  const formsQuery = useApplicationForms();
  const formsByJob = useMemo(
    () => new Map((formsQuery.data ?? []).map((form) => [form.job_id, form])),
    [formsQuery.data],
  );
  const clearFilters = () => setFilters({ q: undefined, status: undefined });

  const newJobLink = (label: string) => (
    <Link to="/jobs/new" className={buttonClasses({ variant: "primary" })}>
      <Plus aria-hidden />
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Jobs"
        description="Click a job to build and share its application form."
        actions={newJobLink("New job")}
      />

      <Card>
        <FilterBar
          actions={
            hasFilters ? (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null
          }
        >
          <FilterField label="Search" htmlFor="jobs-search" className="lg:w-80">
            <SearchInput
              id="jobs-search"
              value={rawQ}
              onSearch={(value) => setFilters({ q: value || undefined })}
              placeholder="Search jobs…"
            />
          </FilterField>
          <FilterField label="Status" className="lg:w-auto">
            <SegmentedControl
              aria-label="Filter by status"
              value={status ?? "all"}
              onValueChange={(value) => setFilters({ status: value === "all" ? undefined : value })}
              options={STATUS_OPTIONS}
            />
          </FilterField>
        </FilterBar>

        <QueryState
          query={jobsQuery}
          loading={<SkeletonTable rows={6} columns={6} />}
          isEmpty={(data) => data.items.length === 0}
          empty={
            hasFilters ? (
              <EmptyState
                icon={SearchX}
                title="No jobs match your filters"
                description="Try a different search term or status."
                action={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : jobsQuery.data && jobsQuery.data.total > 0 ? (
              <EmptyState
                icon={Briefcase}
                title="Nothing on this page"
                description="The list changed since this page was opened."
                action={
                  <Button variant="secondary" onClick={() => setFilters({ page: 1 })}>
                    Go to the first page
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Briefcase}
                title="No jobs yet"
                description="Create a job, then build its application form and share the link."
                action={newJobLink("Create your first job")}
              />
            )
          }
        >
          {(data) => (
            <>
              <JobsTable
                jobs={data.items}
                formsByJob={formsByJob}
                formsStatus={formsQuery.status}
                dimmed={jobsQuery.isPlaceholderData}
              />
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
    </>
  );
}
