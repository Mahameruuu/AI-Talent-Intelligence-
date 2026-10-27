import { Hourglass, Play, RefreshCw, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { Alert, Button, Card, EmptyState, Spinner, StatusBadge, buttonClasses, getStatusLabel } from "@/components/ui";
import type { InterviewEvaluation, InterviewSession } from "@/types/api";
import { canForceCompleteSession, getSessionProgress } from "../../interview-utils";

export function EvaluationRunningCard({ evaluation }: { evaluation: InterviewEvaluation }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 px-6 py-14 text-center" aria-live="polite">
        <div className="flex size-12 items-center justify-center rounded-full bg-indigo-50">
          <Spinner className="size-6" label="Evaluation in progress" />
        </div>
        <div className="max-w-md space-y-1">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-900">
            Evaluating… <StatusBadge kind="evaluation" value={evaluation.status} size="sm" />
          </p>
          <p className="text-sm text-slate-500">
            The AI is scoring each competency against the approved rubric, citing quotes from the transcript. This page
            updates automatically.
          </p>
        </div>
      </div>
    </Card>
  );
}

export function EvaluationFailedAlert({
  evaluation,
  onRerun,
  rerunning,
}: {
  evaluation: InterviewEvaluation;
  onRerun: () => void;
  rerunning: boolean;
}) {
  return (
    <Alert
      tone="danger"
      title="The evaluation failed"
      action={
        <Button variant="secondary" size="sm" leftIcon={<RefreshCw />} onClick={onRerun} loading={rerunning}>
          Re-run evaluation
        </Button>
      }
    >
      {evaluation.error_message ?? "No error details were provided."}
    </Alert>
  );
}

export function NoEvaluationCard({
  session,
  onRun,
  running,
}: {
  session: InterviewSession;
  onRun: () => void;
  running: boolean;
}) {
  if (session.status === "completed") {
    return (
      <Card>
        <EmptyState
          icon={Sparkles}
          title="This interview hasn't been evaluated yet"
          description="The interview is complete. Run the AI evaluation to score the answers against the approved rubric."
          action={
            <Button leftIcon={<Play />} onClick={onRun} loading={running}>
              Run evaluation
            </Button>
          }
        />
      </Card>
    );
  }

  const { answered, total } = getSessionProgress(session);
  const statusLabel = getStatusLabel("interview", session.status).toLowerCase();
  let description: string;
  if (session.status === "revoked" || session.status === "expired") {
    description = `This invitation is ${statusLabel}, so the interview won't be evaluated automatically (${answered} of ${total} questions were answered).`;
  } else {
    description = `The AI evaluation runs automatically once the interview is completed. Current status: ${statusLabel} — ${answered} of ${total} questions answered.`;
    if (canForceCompleteSession(session)) {
      description += " You can force-complete it from the interview page to evaluate the answers given so far.";
    }
  }

  return (
    <Card>
      <EmptyState
        icon={Hourglass}
        title="No evaluation yet"
        description={description}
        action={
          <Link to={`/interviews/${session.id}`} className={buttonClasses({ variant: "secondary" })}>
            Open interview
          </Link>
        }
      />
    </Card>
  );
}
