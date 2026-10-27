import { FileText, UserX } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { Card, EmptyState, ErrorState, Skeleton, buttonClasses } from "@/components/ui";
import { HiringDecisionCard } from "@/features/interviews/components/HiringDecisionCard";
import { InviteCandidateDialog } from "@/features/interviews/components/InviteCandidateDialog";
import { useApplication, useCandidate } from "@/hooks/queries/candidates";
import { useDocument, useLiveDocument, useScreening } from "@/hooks/queries/screening";
import { isDocumentProcessing } from "@/hooks/queries/shared";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { isNotFoundError } from "@/services/api-client";
import type { Application, Candidate } from "@/types/api";
import { parseIntParam } from "@/utils/query-string";
import { ApplicationBar } from "./components/ApplicationBar";
import { CandidateHeader } from "./components/CandidateHeader";
import { CandidateProfileCard } from "./components/CandidateProfileCard";
import { DeleteCandidateDialog } from "./components/DeleteCandidateDialog";
import { StageHistoryCard } from "./components/StageHistoryCard";
import { FormAnswersCard } from "./components/FormAnswersCard";
import { PendingValidationsBar } from "./components/PendingValidationsBar";
import { ProcessingBanner } from "./components/ProcessingBanner";
import { RequirementChecklist } from "./components/RequirementChecklist";
import { ScoreBreakdown } from "./components/ScoreBreakdown";
import { ScreeningSummaryCard } from "./components/ScreeningSummaryCard";
import { UploadDocumentDialog } from "./components/UploadDocumentDialog";
import type { PendingValidations, ValidationDecision } from "./validation";

/** /candidates/:id?application=ID — one applicant's CV-screening result for one job, on a single page. */
export function CandidateDetailPage() {
  const params = useParams();
  const candidateId = parseIntParam(params.id ?? null);
  const candidateQuery = useCandidate(candidateId);
  useDocumentTitle(candidateQuery.data?.full_name ?? "Candidate");

  if (candidateId === undefined || (candidateQuery.isError && isNotFoundError(candidateQuery.error))) {
    return (
      <EmptyState
        icon={UserX}
        title="Candidate not found"
        description="This candidate doesn't exist or was removed."
        action={
          <Link to="/candidates" className={buttonClasses({ variant: "secondary" })}>
            Back to candidates
          </Link>
        }
      />
    );
  }
  if (candidateQuery.isPending) return <DetailSkeleton />;
  if (candidateQuery.isError) {
    return <ErrorState error={candidateQuery.error} onRetry={() => void candidateQuery.refetch()} retrying={candidateQuery.isFetching} />;
  }
  return <CandidateDetail candidate={candidateQuery.data} />;
}

/** Where to go after deleting: back to the candidates list the user came from (keeps its job filter). */
function candidatesListPath(state: unknown): string {
  const from = typeof state === "object" && state !== null && "from" in state ? state.from : undefined;
  return typeof from === "string" && from.startsWith("/candidates") ? from : "/candidates";
}

function CandidateDetail({ candidate }: { candidate: Candidate }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const requestedId = parseIntParam(searchParams.get("application"));
  const selected = candidate.applications.find((item) => item.id === requestedId) ?? candidate.applications[0];
  const applicationQuery = useApplication(selected?.id);
  const application = applicationQuery.data;

  const selectApplication = (id: number) =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("application", String(id));
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-6">
      <Link
        to={selected ? `/candidates?job_id=${selected.job_id}` : "/candidates"}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900"
      >
        ← Candidates
      </Link>
      <CandidateHeader
        candidate={candidate}
        application={application}
        onInvite={() => setInviteOpen(true)}
        onDelete={() => setDeleteOpen(true)}
      >
        {selected ? (
          <ApplicationBar candidate={candidate} selectedId={selected.id} application={application} onSelect={selectApplication} />
        ) : null}
      </CandidateHeader>

      {!selected ? (
        <Card>
          <EmptyState
            icon={FileText}
            title="No job applications"
            description="This candidate isn't linked to a job yet, so there's no screening result to show."
          />
        </Card>
      ) : applicationQuery.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : applicationQuery.isError ? (
        <ErrorState error={applicationQuery.error} onRetry={() => void applicationQuery.refetch()} retrying={applicationQuery.isFetching} />
      ) : (
        <ApplicationResult
          // Reset per-application state (unsaved requirement checks) when switching applications.
          key={applicationQuery.data.id}
          candidate={candidate}
          application={applicationQuery.data}
          onUpload={() => setUploadOpen(true)}
        />
      )}

      {deleteOpen ? (
        <DeleteCandidateDialog
          open
          onClose={() => setDeleteOpen(false)}
          candidateId={candidate.id}
          candidateName={candidate.full_name}
          application={selected ? { id: selected.id, jobTitle: selected.job_title } : undefined}
          defaultScope="candidate"
          onDeleted={(scope) => {
            const remaining = candidate.applications.find((item) => item.id !== selected?.id);
            if (scope === "application" && remaining) selectApplication(remaining.id);
            else void navigate(candidatesListPath(location.state));
          }}
        />
      ) : null}

      {application ? (
        <>
          <UploadDocumentDialog
            open={uploadOpen}
            onClose={() => setUploadOpen(false)}
            applicationId={application.id}
            jobTitle={application.job_title}
            onUploaded={() => {
              void applicationQuery.refetch();
            }}
          />
          <InviteCandidateDialog
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            applicationId={application.id}
            jobId={application.job_id}
            candidateName={application.candidate_name}
          />
        </>
      ) : null}
    </div>
  );
}

interface ApplicationResultProps {
  candidate: Candidate;
  application: Application;
  onUpload: () => void;
}

function ApplicationResult({ candidate, application, onUpload }: ApplicationResultProps) {
  const liveDocument = useLiveDocument(application.latest_document);
  const documentReady = liveDocument !== null && !isDocumentProcessing(liveDocument.status);
  const documentQuery = useDocument(documentReady && liveDocument.status === "completed" ? liveDocument.id : undefined);
  const screeningQuery = useScreening(application.id);
  const screening = screeningQuery.data ?? null;
  const [pending, setPending] = useState<PendingValidations>({});

  const setValidation = useCallback((key: string, decision: ValidationDecision | null) => {
    setPending((current) => {
      const next = { ...current };
      if (decision === null) delete next[key];
      else next[key] = decision;
      return next;
    });
  }, []);
  const clearValidations = useCallback(() => setPending({}), []);

  return (
    <div className="space-y-6">
      <ProcessingBanner document={liveDocument} onUpload={onUpload} />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          {screeningQuery.isPending ? (
            <Skeleton className="h-56 rounded-xl" />
          ) : screeningQuery.isError ? (
            <ErrorState
              title="Couldn't load the screening result"
              error={screeningQuery.error}
              onRetry={() => void screeningQuery.refetch()}
              retrying={screeningQuery.isFetching}
            />
          ) : (
            <>
              <ScreeningSummaryCard
                applicationId={application.id}
                jobTitle={application.job_title}
                screening={screening}
                document={liveDocument}
              />
              {screening ? (
                <>
                  <ScoreBreakdown components={screening.components} />
                  <RequirementChecklist requirements={screening.requirements} pending={pending} onValidate={setValidation} />
                </>
              ) : null}
            </>
          )}
        </div>
        <div className="min-w-0 space-y-6">
          {documentQuery.isError ? (
            <ErrorState
              compact
              title="Couldn't load the CV details"
              error={documentQuery.error}
              onRetry={() => void documentQuery.refetch()}
            />
          ) : null}
          <HiringDecisionCard application={application} />
          <StageHistoryCard application={application} />
          <CandidateProfileCard
            candidate={candidate}
            extraction={documentQuery.data?.extraction}
            extractionLoading={documentQuery.isLoading}
          />
          <FormAnswersCard application={application} />
        </div>
      </div>

      <PendingValidationsBar applicationId={application.id} pending={pending} onClear={clearValidations} />
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading candidate">
      <Skeleton className="h-4 w-24" />
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-10 w-20" />
        </div>
        <Skeleton className="h-10 w-full" />
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    </div>
  );
}
