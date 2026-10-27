import { Briefcase } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, buttonClasses, Card, CardContent, EmptyState, ErrorState, Skeleton, useToast } from "@/components/ui";
import { useCreateJob, useJob, useUpdateJob } from "@/hooks/queries/jobs";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { getErrorMessage, isApiError, isNotFoundError } from "@/services/api-client";
import type { Job, JobInput } from "@/types/api";
import { JobForm } from "./components/JobForm";
import { describeErrorDetails } from "./job-utils";

function parseId(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** /jobs/new and /jobs/:id/edit */
export function JobFormPage() {
  const params = useParams();
  const mode = params.id === undefined ? "create" : "edit";
  const jobId = parseId(params.id);
  const jobQuery = useJob(mode === "edit" && jobId !== null ? jobId : undefined);
  useDocumentTitle(mode === "create" ? "New job" : jobQuery.data ? `Edit ${jobQuery.data.title}` : "Edit job");

  if (mode === "create") return <JobFormScreen mode="create" />;

  if (jobId === null || (jobQuery.isError && isNotFoundError(jobQuery.error))) {
    return (
      <>
        <PageHeader title="Edit job" backTo="/jobs" backLabel="All jobs" />
        <Card>
          <EmptyState
            icon={Briefcase}
            title="Job not found"
            description="This job doesn't exist or was removed."
            action={
              <Link to="/jobs" className={buttonClasses({ variant: "secondary" })}>
                Back to jobs
              </Link>
            }
          />
        </Card>
      </>
    );
  }

  if (jobQuery.isPending) return <JobFormSkeleton />;
  if (jobQuery.isError) {
    return (
      <>
        <PageHeader title="Edit job" backTo="/jobs" backLabel="All jobs" />
        <ErrorState
          error={jobQuery.error}
          onRetry={() => void jobQuery.refetch()}
          retrying={jobQuery.isFetching}
        />
      </>
    );
  }
  return <JobFormScreen key={jobQuery.data.id} mode="edit" job={jobQuery.data} />;
}

function JobFormScreen({ mode, job }: { mode: "create" | "edit"; job?: Job }) {
  const navigate = useNavigate();
  const toast = useToast();
  const createJob = useCreateJob();
  const updateJob = useUpdateJob(job?.id ?? 0);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const [searchParams] = useSearchParams();
  // Opened from the application form ("Edit job"): go back there; otherwise back to the list.
  const fromForm = job !== undefined && searchParams.get("from") === "form";
  const backTo = fromForm ? `/jobs/${job.id}/form` : "/jobs";

  const handleSubmit = async (input: JobInput) => {
    setSubmitError(null);
    try {
      if (mode === "create") {
        const created = await createJob.mutateAsync(input);
        toast.success("Job created successfully", `“${created.title}” has been added to your jobs.`);
        navigate("/jobs");
      } else {
        const saved = await updateJob.mutateAsync(input);
        toast.success("Changes saved", saved.title);
        navigate(fromForm ? `/jobs/${saved.id}/form` : "/jobs");
      }
    } catch (error) {
      setSubmitError(error);
      toast.error(mode === "create" ? "Couldn't create the job" : "Couldn't save changes", getErrorMessage(error));
      requestAnimationFrame(() => alertRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const details = isApiError(submitError) ? describeErrorDetails(submitError.details) : [];

  return (
    <>
      <PageHeader
        title={mode === "create" ? "New job" : "Edit job"}
        description={
          mode === "create"
            ? "Fill in five short steps. Candidates who apply are screened against these requirements automatically."
            : job?.title
        }
        backTo={backTo}
        backLabel={fromForm ? "Application form" : "All jobs"}
      />
      <div ref={alertRef} className="scroll-mt-24">
        {submitError ? (
          <Alert tone="danger" title={mode === "create" ? "The job couldn't be created" : "Your changes couldn't be saved"} className="mb-6">
            <p>{getErrorMessage(submitError)}</p>
            {details.length > 0 ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {details.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}
      </div>
      <div>
        <JobForm
          mode={mode}
          defaultValues={job}
          onSubmit={handleSubmit}
          submitting={createJob.isPending || updateJob.isPending}
          onCancel={() => navigate(backTo)}
        />
      </div>
    </>
  );
}

function JobFormSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading job">
      <div className="mb-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="space-y-6">
        {[0, 1].map((card) => (
          <Card key={card}>
            <div className="border-b border-slate-100 px-5 py-4">
              <Skeleton className="h-4 w-32" />
            </div>
            <CardContent className="grid gap-4 py-5 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, index) => (
                <div key={index} className="space-y-2">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-9 w-full" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
