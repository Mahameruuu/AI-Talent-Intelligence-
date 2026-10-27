import { ClipboardList, Plus } from "lucide-react";
import { useParams } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button, Card, CardContent, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { useCreateFormAndOpen } from "@/features/application-forms/use-open-form-builder";
import { NotFoundCard } from "@/features/interviews/components/NotFoundCard";
import { parseIdParam } from "@/features/interviews/interview-utils";
import { useJobForm } from "@/hooks/queries/forms";
import { useJob } from "@/hooks/queries/jobs";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { isNotFoundError } from "@/services/api-client";
import type { Job } from "@/types/api";
import { jobSubtitle } from "@/features/jobs/job-utils";
import { FormBuilder } from "./components/form-builder/FormBuilder";

function BuilderSkeleton() {
  return (
    <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading application form">
      <div className="mb-5 space-y-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="mb-5 h-14 w-full rounded-xl" />
      <Card className="mb-5">
        <CardContent className="space-y-3 py-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function NoFormYet({ job }: { job: Job }) {
  const { create, pendingJobId } = useCreateFormAndOpen();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Application form" description={jobSubtitle(job)} backTo="/jobs" backLabel="Jobs" />
      <Card>
        <EmptyState
          icon={ClipboardList}
          title="No application form yet"
          description="Create one to get a link applicants can use. We add a few suggested questions to start."
          action={
            <Button leftIcon={<Plus />} onClick={() => create(job.id)} loading={pendingJobId === job.id}>
              Create application form
            </Button>
          }
        />
      </Card>
    </div>
  );
}

/** /jobs/:id/form — build and share a job's public application form (clicking a job opens this). */
export function FormBuilderPage() {
  const params = useParams();
  const jobId = parseIdParam(params.id) ?? undefined;
  const jobQuery = useJob(jobId);
  const formQuery = useJobForm(jobId);
  useDocumentTitle(jobQuery.data ? `Application form · ${jobQuery.data.title}` : "Application form");

  const notFound = (
    <NotFoundCard
      title="Job not found"
      description="This job doesn't exist or was removed."
      backTo="/jobs"
      backLabel="Back to jobs"
    />
  );

  if (jobId === undefined || (jobQuery.isError && isNotFoundError(jobQuery.error))) return notFound;
  if (jobQuery.isPending || formQuery.isPending) return <BuilderSkeleton />;
  if (jobQuery.isError) {
    return <ErrorState error={jobQuery.error} onRetry={() => void jobQuery.refetch()} retrying={jobQuery.isFetching} />;
  }
  if (formQuery.isError) {
    return (
      <ErrorState error={formQuery.error} onRetry={() => void formQuery.refetch()} retrying={formQuery.isFetching} />
    );
  }
  if (formQuery.data === null) return <NoFormYet job={jobQuery.data} />;
  // Remount (fresh form state) when another form is loaded, e.g. after navigating between jobs.
  return <FormBuilder key={formQuery.data.id} job={jobQuery.data} form={formQuery.data} />;
}
