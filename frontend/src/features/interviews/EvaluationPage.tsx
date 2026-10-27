import { AlertTriangle, ListX, MessagesSquare, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Skeleton,
  SkeletonText,
  StatusBadge,
  buttonClasses,
  useToast,
} from "@/components/ui";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useEvaluation, useInterview, useRerunEvaluation } from "@/hooks/queries/interviews";
import { isEvaluationRunning } from "@/hooks/queries/shared";
import { getErrorMessage, isNotFoundError } from "@/services/api-client";
import type { InterviewEvaluation, InterviewSession } from "@/types/api";
import { pluralize } from "@/utils/format";
import { CompetencyEvaluationCard } from "./components/evaluation/CompetencyEvaluationCard";
import {
  EvaluationFailedAlert,
  EvaluationRunningCard,
  NoEvaluationCard,
} from "./components/evaluation/EvaluationStatePanels";
import { EvaluationSummaryCard } from "./components/evaluation/EvaluationSummaryCard";
import { ReviewerNotesCard } from "./components/evaluation/ReviewerNotesCard";
import { SessionHiringDecision } from "./components/HiringDecisionCard";
import { InterviewModeBadge } from "./components/InterviewModeBadge";
import { InterviewTranscript, TranscriptSkeletonRows } from "./components/InterviewTranscript";
import { NotFoundCard } from "./components/NotFoundCard";
import { parseIdParam } from "./interview-utils";
import { useTranscriptHighlight, type TranscriptHighlight } from "./use-transcript-highlight";

function EvaluationSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading evaluation">
      <div className="mb-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="flex gap-6 py-5">
              <Skeleton className="size-28 shrink-0 rounded-full" />
              <SkeletonText lines={4} className="flex-1" />
            </CardContent>
          </Card>
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index}>
              <CardContent className="space-y-4 py-5">
                <Skeleton className="h-4 w-48" />
                <SkeletonText lines={3} />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="py-5">
            <TranscriptSkeletonRows rows={4} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TranscriptPanel({ session, highlight }: { session: InterviewSession; highlight: TranscriptHighlight | null }) {
  return (
    <Card className="xl:sticky xl:top-24">
      <CardHeader
        icon={<MessagesSquare />}
        title="Transcript"
        description={
          session.messages.length > 0
            ? "Click an evidence quote to jump to the message it comes from."
            : undefined
        }
        actions={
          <Link to={`/interviews/${session.id}`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
            Open
          </Link>
        }
      />
      <CardContent className="scrollbar-thin xl:max-h-[calc(100vh-13rem)] xl:overflow-y-auto">
        <InterviewTranscript messages={session.messages} candidateName={session.candidate_name} highlight={highlight} />
      </CardContent>
    </Card>
  );
}

function UnansweredAreasCard({ areas }: { areas: string[] }) {
  return (
    <Card>
      <CardHeader
        icon={<ListX />}
        title="Unanswered areas"
        description="Topics from the template that the answers didn't cover."
      />
      <CardContent>
        {areas.length === 0 ? (
          <p className="text-sm text-slate-500">No unanswered areas were recorded.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {areas.map((area, index) => (
              <li
                key={`${area}-${index}`}
                className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-sm text-amber-900"
              >
                {area}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EvaluationResult({
  evaluation,
  decision,
  onQuoteClick,
}: {
  evaluation: InterviewEvaluation;
  /** HR decision card, shown right after the overall score. */
  decision: ReactNode;
  onQuoteClick: (messageId: number) => void;
}) {
  const insufficientCount = evaluation.competencies.filter((competency) => competency.insufficient_evidence).length;
  const unscoredCount = evaluation.competencies.filter(
    (competency) => !competency.insufficient_evidence && competency.score === null,
  ).length;
  return (
    <>
      {evaluation.status === "needs_review" ? (
        <Alert tone="warning" title="Needs HR review" icon={AlertTriangle} className="border-amber-300 bg-amber-50">
          {insufficientCount > 0
            ? `${pluralize(insufficientCount, "competency", "competencies")} couldn't be scored from the answers. `
            : null}
          {unscoredCount > 0
            ? `${pluralize(unscoredCount, "competency", "competencies")} ${unscoredCount === 1 ? "has" : "have"} evidence but no automated score. `
            : null}
          {insufficientCount === 0 && unscoredCount === 0 ? "The AI flagged this evaluation for a human check. " : null}
          Read the cited evidence and the transcript, then record your assessment in the reviewer notes.
        </Alert>
      ) : null}

      <EvaluationSummaryCard evaluation={evaluation} />
      {decision}

      <section aria-labelledby="competency-heading" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="competency-heading" className="text-base font-semibold text-slate-900">
            Competencies
          </h2>
          <p className="text-xs text-slate-500">Scored 1–5 against the rubric of the approved template</p>
        </div>
        {evaluation.competencies.length === 0 ? (
          <Card>
            <CardContent>
              <p className="text-sm text-slate-500">This evaluation contains no competency scores.</p>
            </CardContent>
          </Card>
        ) : (
          evaluation.competencies.map((competency, index) => (
            <CompetencyEvaluationCard
              key={`${competency.competency}-${index}`}
              competency={competency}
              onQuoteClick={onQuoteClick}
            />
          ))
        )}
      </section>

      <UnansweredAreasCard areas={evaluation.unanswered_areas} />
      <ReviewerNotesCard key={evaluation.id} evaluation={evaluation} />
    </>
  );
}

export function EvaluationPage() {
  const params = useParams();
  const sessionId = parseIdParam(params.id);
  const sessionQuery = useInterview(sessionId ?? undefined);
  const evaluationQuery = useEvaluation(sessionId ?? undefined);
  const rerunMutation = useRerunEvaluation(sessionId ?? 0);
  const toast = useToast();
  const { highlight, focusMessage } = useTranscriptHighlight();
  const [confirmRerun, setConfirmRerun] = useState(false);

  useDocumentTitle(sessionQuery.data ? `Evaluation · ${sessionQuery.data.candidate_name}` : "Interview evaluation");

  const rerun = () => {
    rerunMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Evaluation started", "The results update automatically when it finishes.");
        setConfirmRerun(false);
      },
      onError: (error) => toast.error("Couldn't start the evaluation", getErrorMessage(error)),
    });
  };

  if (sessionId === null || (sessionQuery.isError && isNotFoundError(sessionQuery.error))) {
    return (
      <NotFoundCard
        title="Interview not found"
        description="This interview session doesn't exist or was removed, so there is no evaluation to show."
        backTo="/interviews"
        backLabel="Back to interviews"
      />
    );
  }
  if (sessionQuery.isPending || evaluationQuery.isPending) return <EvaluationSkeleton />;
  if (sessionQuery.isError) {
    return (
      <ErrorState error={sessionQuery.error} onRetry={() => void sessionQuery.refetch()} retrying={sessionQuery.isFetching} />
    );
  }

  const session = sessionQuery.data;
  const evaluation = evaluationQuery.isError ? undefined : evaluationQuery.data;
  const running = evaluation ? isEvaluationRunning(evaluation.status) : false;
  const hasResult = evaluation?.status === "completed" || evaluation?.status === "needs_review";

  const decision = <SessionHiringDecision session={session} />;
  let main: ReactNode;
  if (evaluationQuery.isError) {
    main = (
      <ErrorState
        error={evaluationQuery.error}
        title="Couldn't load the evaluation"
        onRetry={() => void evaluationQuery.refetch()}
        retrying={evaluationQuery.isFetching}
      />
    );
  } else if (!evaluation) {
    main = <NoEvaluationCard session={session} onRun={rerun} running={rerunMutation.isPending} />;
  } else if (running) {
    main = <EvaluationRunningCard evaluation={evaluation} />;
  } else if (evaluation.status === "failed") {
    main = (
      <EvaluationFailedAlert
        evaluation={evaluation}
        onRerun={rerun}
        rerunning={rerunMutation.isPending}
      />
    );
  } else {
    main = <EvaluationResult evaluation={evaluation} decision={decision} onQuoteClick={focusMessage} />;
  }

  return (
    <div>
      <PageHeader
        backTo={`/interviews/${session.id}`}
        backLabel="Interview"
        title={session.candidate_name}
        meta={evaluation ? <StatusBadge kind="evaluation" value={evaluation.status} /> : null}
        description={
          <span>
            Interview evaluation <span className="text-slate-300">·</span> {session.job_title}{" "}
            <span className="text-slate-300">·</span> {session.template_name}{" "}
            <span className="text-slate-300">·</span> <InterviewModeBadge mode={session.mode} />
          </span>
        }
        actions={
          hasResult ? (
            <Button variant="secondary" leftIcon={<RefreshCw />} onClick={() => setConfirmRerun(true)}>
              Re-run evaluation
            </Button>
          ) : null
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6">
          {main}
          {hasResult ? null : decision}
        </div>
        <TranscriptPanel session={session} highlight={highlight} />
      </div>

      <ConfirmDialog
        open={confirmRerun}
        onClose={() => setConfirmRerun(false)}
        onConfirm={rerun}
        loading={rerunMutation.isPending}
        title="Re-run the AI evaluation?"
        description="The transcript is evaluated again against the approved rubric. The current scores are replaced by the new result when it finishes."
        confirmLabel="Re-run evaluation"
      />
    </div>
  );
}
