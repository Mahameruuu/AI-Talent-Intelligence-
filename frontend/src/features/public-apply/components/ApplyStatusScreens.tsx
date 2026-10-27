import { CalendarClock, CheckCircle2, Hourglass, Link2Off, Loader2, Lock, MailCheck, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui";
import { CandidateLayout } from "@/features/candidate-interview/components/CandidateLayout";
import { StatusCard } from "@/features/candidate-interview/components/StatusScreens";
import { formatDay } from "@/utils/format";
import type { ClosedReason } from "../apply-utils";

const SUBTITLE = "Job application";

export function ApplyLoadingScreen() {
  return (
    <CandidateLayout subtitle={SUBTITLE}>
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500" role="status">
        <Loader2 className="size-7 animate-spin text-indigo-600" aria-hidden />
        <p className="text-sm">Loading the application form…</p>
      </div>
    </CandidateLayout>
  );
}

export function InvalidLinkScreen() {
  return (
    <CandidateLayout subtitle={SUBTITLE}>
      <StatusCard icon={Link2Off} tone="neutral" title="This application link isn't valid">
        <p>
          We couldn&apos;t find an application form at this address. The link may be incomplete, or the employer may
          have replaced it with a new one.
        </p>
        <p className="text-sm text-slate-500">
          Check that you copied the whole link, or go back to where you saw the job posting for the latest link.
        </p>
      </StatusCard>
    </CandidateLayout>
  );
}

export function LoadErrorScreen({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <CandidateLayout subtitle={SUBTITLE}>
      <StatusCard
        icon={WifiOff}
        tone="neutral"
        title="We couldn't load the application form"
        action={
          <Button size="lg" onClick={onRetry} loading={retrying} leftIcon={<RefreshCw />} className="h-12 px-6">
            Try again
          </Button>
        }
      >
        <p>This is usually a temporary connection problem. Check your internet connection and try again.</p>
      </StatusCard>
    </CandidateLayout>
  );
}

export function ApplicationsClosedScreen({
  jobTitle,
  companyName,
  reason = "closed",
  opensOn,
  closesOn,
}: {
  jobTitle?: string;
  companyName?: string;
  reason?: ClosedReason;
  opensOn?: string | null;
  closesOn?: string | null;
}) {
  const job = jobTitle ? <span className="font-medium text-slate-800">{jobTitle}</span> : "this position";
  if (reason === "not_yet_open") {
    return (
      <CandidateLayout companyName={companyName} subtitle={SUBTITLE}>
        <StatusCard icon={CalendarClock} tone="neutral" title="Applications aren't open yet">
          <p>
            Applications for {job} open on{" "}
            <span className="font-medium text-slate-800">{opensOn ? formatDay(opensOn) : "a later date"}</span>
            {closesOn ? <> and close on {formatDay(closesOn)}</> : null}. Please come back then.
          </p>
        </StatusCard>
      </CandidateLayout>
    );
  }
  return (
    <CandidateLayout companyName={companyName} subtitle={SUBTITLE}>
      <StatusCard
        icon={Lock}
        tone="neutral"
        title={reason === "deadline_passed" ? "The application deadline has passed" : "Applications are closed"}
      >
        <p>
          {reason === "deadline_passed" && closesOn ? (
            <>
              Applications for {job} closed on <span className="font-medium text-slate-800">{formatDay(closesOn)}</span>.
            </>
          ) : (
            <>{jobTitle ? <>The {job} position</> : "This position"} is no longer accepting applications.</>
          )}
        </p>
        <p className="text-sm text-slate-500">
          Thank you for your interest{companyName ? ` in ${companyName}` : ""}. Keep an eye on our other openings.
        </p>
      </StatusCard>
    </CandidateLayout>
  );
}

export function AlreadyAppliedScreen({
  message,
  jobTitle,
  companyName,
}: {
  message: string;
  jobTitle: string;
  companyName: string;
}) {
  return (
    <CandidateLayout companyName={companyName} subtitle={SUBTITLE}>
      <StatusCard icon={MailCheck} tone="success" title="You've already applied">
        <p>{message || "You have already applied for this position with this email address."}</p>
        <p className="text-sm text-slate-500">
          Your application for <span className="font-medium text-slate-700">{jobTitle}</span> is with the recruitment
          team, so there&apos;s no need to apply again. They&apos;ll contact you about the next steps.
        </p>
      </StatusCard>
    </CandidateLayout>
  );
}

export function RateLimitedScreen({
  message,
  companyName,
  onBack,
}: {
  message: string;
  companyName: string;
  onBack: () => void;
}) {
  return (
    <CandidateLayout companyName={companyName} subtitle={SUBTITLE}>
      <StatusCard
        icon={Hourglass}
        tone="warning"
        title="Please wait a little while"
        action={
          <Button size="lg" variant="secondary" onClick={onBack} className="h-12 px-6">
            Back to the form
          </Button>
        }
      >
        <p>{message || "Too many applications were sent from this network."}</p>
        <p className="text-sm text-slate-500">Your answers are still filled in. Please try again later.</p>
      </StatusCard>
    </CandidateLayout>
  );
}

export function SubmittedScreen({
  jobTitle,
  companyName,
  fullName,
}: {
  jobTitle: string;
  companyName: string;
  fullName: string;
}) {
  return (
    <CandidateLayout companyName={companyName} subtitle={SUBTITLE}>
      <StatusCard icon={CheckCircle2} tone="success" title={fullName ? `Thank you, ${fullName}!` : "Thank you!"}>
        <p>
          Your application for <span className="font-medium text-slate-800">{jobTitle}</span>
          {companyName ? ` at ${companyName}` : ""} has been received.
        </p>
      </StatusCard>
    </CandidateLayout>
  );
}
