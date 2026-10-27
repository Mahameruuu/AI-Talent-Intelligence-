import { CheckCircle2, Gavel, XCircle } from "lucide-react";
import { useId, useState } from "react";
import { Button, Card, CardContent, CardHeader, Dialog, Label, Textarea, useToast } from "@/components/ui";
import { useApplication, useDecideApplication } from "@/hooks/queries/candidates";
import { getErrorMessage } from "@/services/api-client";
import type { Application, HiringDecision, InterviewSession } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDate, formatDateTime } from "@/utils/format";

const NOTE_MAX = 2000;

type HiringDecisionState = "decided" | "eligible" | "waiting" | "none";

/** Which variant of the HR decision card applies to an application. */
function hiringDecisionState(application: Application): HiringDecisionState {
  if (application.decision) return "decided";
  if (application.stage !== "interview") return "none";
  return application.has_completed_interview ? "eligible" : "waiting";
}

function DecisionResult({ application }: { application: Application }) {
  const accepted = application.decision === "accepted";
  const Icon = accepted ? CheckCircle2 : XCircle;
  return (
    <Card
      className={cn(accepted ? "border-emerald-200 bg-emerald-50/70" : "border-rose-200 bg-rose-50/70")}
      role="status"
      aria-label="HR decision"
    >
      <CardContent className="flex items-start gap-3">
        <Icon className={cn("mt-0.5 size-5 shrink-0", accepted ? "text-emerald-600" : "text-rose-600")} aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className={cn("text-sm font-semibold", accepted ? "text-emerald-800" : "text-rose-800")}>
            {accepted ? "Accepted · Hired" : "Rejected"}
          </p>
          <p className="text-xs text-slate-600">
            {application.decided_by ? <>by {application.decided_by} </> : null}
            {application.decided_at ? (
              <>
                on{" "}
                <time dateTime={application.decided_at} title={formatDateTime(application.decided_at)}>
                  {formatDate(application.decided_at)}
                </time>
              </>
            ) : null}
          </p>
          {application.decision_note ? (
            <p className="whitespace-pre-line text-sm text-slate-700">{application.decision_note}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionDialog({
  application,
  decision,
  onClose,
}: {
  application: Application;
  decision: HiringDecision;
  onClose: () => void;
}) {
  const toast = useToast();
  const noteId = useId();
  const [note, setNote] = useState("");
  const mutation = useDecideApplication(application.id);
  const accept = decision === "accepted";

  const confirm = () => {
    const trimmed = note.trim();
    mutation.mutate(trimmed ? { decision, note: trimmed } : { decision }, {
      onSuccess: () => {
        toast.success(accept ? "Candidate accepted" : "Candidate rejected");
        onClose();
      },
      onError: (error) => toast.error("Couldn't save the decision", getErrorMessage(error)),
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      dismissible={!mutation.isPending}
      title={`${accept ? "Accept" : "Reject"} ${application.candidate_name} for ${application.job_title}?`}
      description="This is final and can't be changed."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button variant={accept ? "success" : "danger"} onClick={confirm} loading={mutation.isPending}>
            {accept ? "Accept candidate" : "Reject candidate"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor={noteId}>Note (optional)</Label>
        <Textarea
          id={noteId}
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          data-autofocus
        />
      </div>
    </Dialog>
  );
}

export interface HiringDecisionCardProps {
  application: Application;
}

/** Final HR decision (Accept / Reject) after the AI interview, or the decision once made. */
export function HiringDecisionCard({ application }: HiringDecisionCardProps) {
  const [pending, setPending] = useState<HiringDecision | null>(null);
  const state = hiringDecisionState(application);

  if (state === "decided") return <DecisionResult application={application} />;
  if (state === "none") return null;
  if (state === "waiting") {
    return (
      <Card>
        <CardHeader icon={<Gavel />} title="HR decision" description="Available after the AI interview is completed." />
      </Card>
    );
  }
  return (
    <Card className="border-indigo-200">
      <CardHeader
        icon={<Gavel />}
        title="HR decision"
        description="Final decision after reviewing the interview. This can't be changed."
      />
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="success" leftIcon={<CheckCircle2 />} onClick={() => setPending("accepted")}>
          Accept
        </Button>
        <Button variant="danger-outline" leftIcon={<XCircle />} onClick={() => setPending("rejected")}>
          Reject
        </Button>
      </CardContent>
      {pending ? <DecisionDialog application={application} decision={pending} onClose={() => setPending(null)} /> : null}
    </Card>
  );
}

/** HR decision card for an interview session: loads the session's application when a decision is relevant. */
export function SessionHiringDecision({ session }: { session: InterviewSession }) {
  const relevant = session.application_decision !== null || session.application_stage === "interview";
  const query = useApplication(relevant ? session.application_id : undefined);
  if (!relevant || !query.data) return null;
  return <HiringDecisionCard application={query.data} />;
}
