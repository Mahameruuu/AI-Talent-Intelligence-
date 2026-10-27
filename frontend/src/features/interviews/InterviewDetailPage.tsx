import { ClipboardCheck, Radio } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  ErrorState,
  Skeleton,
  SkeletonText,
  StatusBadge,
  buttonClasses,
} from "@/components/ui";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useInterview } from "@/hooks/queries/interviews";
import { isNotFoundError } from "@/services/api-client";
import type { InterviewSession } from "@/types/api";
import { formatDateTime, formatRelative, pluralize } from "@/utils/format";
import { INTERVIEW_LANGUAGE_LABELS } from "@/utils/labels";
import { InterviewModeBadge } from "./components/InterviewModeBadge";
import { SessionHiringDecision } from "./components/HiringDecisionCard";
import { InvitationEmailStatus } from "./components/InvitationEmailStatus";
import { SessionQuestionsCard } from "./components/SessionQuestionsCard";
import { InterviewTranscript, TranscriptSkeletonRows } from "./components/InterviewTranscript";
import { NotFoundCard } from "./components/NotFoundCard";
import { SessionActions } from "./components/SessionActions";
import { SessionProgress } from "./components/SessionProgress";
import { hasEvaluationView, parseIdParam, parseMessageHash } from "./interview-utils";
import { useTranscriptHighlight } from "./use-transcript-highlight";

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-800">{children}</dd>
    </div>
  );
}

function DateValue({ value, relative = false }: { value: string | null; relative?: boolean }) {
  if (!value) return <span className="font-normal text-slate-400">—</span>;
  return (
    <span className="flex flex-col items-end">
      <span className="tabular-nums">{formatDateTime(value)}</span>
      {relative ? <span className="text-xs font-normal text-slate-500">{formatRelative(value)}</span> : null}
    </span>
  );
}

function emptyTranscriptCopy(session: InterviewSession): { title: string; description: string } {
  if (session.status === "revoked") {
    return { title: "No answers recorded", description: "This invitation was revoked before the candidate started." };
  }
  if (session.status === "expired") {
    return { title: "No answers recorded", description: "The invitation expired before the candidate started." };
  }
  return {
    title: "The candidate hasn't started yet",
    description: "The transcript appears here once the candidate opens the invitation link, gives consent and starts answering.",
  };
}

function SessionDetailsCard({ session }: { session: InterviewSession }) {
  const isOpen = session.status === "pending" || session.status === "in_progress";
  return (
    <Card>
      <CardHeader title="Session details" />
      <CardContent className="space-y-4">
        <SessionProgress session={session} barClassName="h-2" />
        <dl className="divide-y divide-slate-100">
          <DetailRow label="Status">
            <StatusBadge kind="interview" value={session.status} />
          </DetailRow>
          <DetailRow label="Job">{session.job_title}</DetailRow>
          <DetailRow label="Template">{session.template_name}</DetailRow>
          <DetailRow label="Language">{INTERVIEW_LANGUAGE_LABELS[session.language] ?? session.language}</DetailRow>
          <DetailRow label="Interview style">
            <InterviewModeBadge mode={session.mode} />
          </DetailRow>
          <DetailRow label="Invitation email">
            <InvitationEmailStatus email={session.invitation_email} />
          </DetailRow>
          <DetailRow label="Invited">
            <DateValue value={session.created_at} />
          </DetailRow>
          <DetailRow label={session.status === "expired" ? "Expired" : "Expires"}>
            <DateValue value={session.expires_at} relative={isOpen} />
          </DetailRow>
          <DetailRow label="Started">
            <DateValue value={session.started_at} />
          </DetailRow>
          <DetailRow label="Completed">
            <DateValue value={session.completed_at} />
          </DetailRow>
          <DetailRow label="Evaluation">
            {session.evaluation_status ? (
              <StatusBadge kind="evaluation" value={session.evaluation_status} />
            ) : (
              <span className="font-normal text-slate-400">Not started</span>
            )}
          </DetailRow>
        </dl>
      </CardContent>
    </Card>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading interview">
      <div className="mb-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="py-5">
            <TranscriptSkeletonRows rows={5} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <SkeletonText lines={8} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function InterviewDetailPage() {
  const params = useParams();
  const sessionId = parseIdParam(params.id);
  const query = useInterview(sessionId ?? undefined);
  const location = useLocation();
  const hashMessageId = parseMessageHash(location.hash);
  const { highlight, focusMessage } = useTranscriptHighlight();
  const session = query.data;

  useDocumentTitle(session ? `Interview · ${session.candidate_name}` : "Interview");

  const transcriptReady = Boolean(session && session.messages.length > 0);
  const cvQuestionIds = useMemo(
    () => new Set((session?.questions ?? []).filter((question) => question.source === "cv").map((question) => question.id)),
    [session?.questions],
  );
  useEffect(() => {
    if (transcriptReady && hashMessageId !== null) focusMessage(hashMessageId);
  }, [transcriptReady, hashMessageId, focusMessage]);

  if (sessionId === null || (query.isError && isNotFoundError(query.error))) {
    return (
      <NotFoundCard
        title="Interview not found"
        description="This interview session doesn't exist or was removed."
        backTo="/interviews"
        backLabel="Back to interviews"
      />
    );
  }
  if (query.isPending) return <DetailSkeleton />;
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }

  const data = query.data;
  const emptyCopy = emptyTranscriptCopy(data);
  const isLive = data.status === "in_progress";

  return (
    <div>
      <PageHeader
        backTo="/interviews"
        backLabel="Interviews"
        title={data.candidate_name}
        meta={<StatusBadge kind="interview" value={data.status} />}
        description={
          <span>
            {data.job_title} <span className="text-slate-300">·</span> {data.template_name}{" "}
            <span className="text-slate-300">·</span> {INTERVIEW_LANGUAGE_LABELS[data.language] ?? data.language}{" "}
            <span className="text-slate-300">·</span> <InterviewModeBadge mode={data.mode} />
          </span>
        }
        actions={
          <>
            <SessionActions session={data} />
            {hasEvaluationView(data) ? (
              <Link to={`/interviews/${data.id}/evaluation`} className={buttonClasses({ variant: "primary" })}>
                <ClipboardCheck aria-hidden />
                View evaluation
              </Link>
            ) : null}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Transcript"
            description={
              data.messages.length > 0
                ? `${pluralize(data.messages.length, "message")} · AI interviewer questions on the left, candidate answers on the right`
                : undefined
            }
            actions={
              isLive ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700">
                  <Radio className="size-3.5 animate-pulse" aria-hidden />
                  Live — refreshes automatically
                </span>
              ) : null
            }
          />
          <CardContent>
            <InterviewTranscript
              messages={data.messages}
              candidateName={data.candidate_name}
              highlight={highlight}
              emptyTitle={emptyCopy.title}
              emptyDescription={emptyCopy.description}
              cvQuestionIds={cvQuestionIds}
            />
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-6">
          <SessionHiringDecision session={data} />
          <SessionDetailsCard session={data} />
          <SessionQuestionsCard questions={data.questions} mode={data.mode} />
        </div>
      </div>
    </div>
  );
}
