import { CheckCircle2, Clock, Link2Off, Loader2, RefreshCw, ShieldAlert, WifiOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import type { CandidateInterviewState } from "@/types/api";
import { cn } from "@/utils/cn";
import type { TerminalReason } from "../candidate-interview-utils";
import { useInterviewCopy } from "../i18n";
import { CandidateLayout } from "./CandidateLayout";

const iconTones = {
  success: "bg-emerald-50 text-emerald-600 ring-emerald-100",
  warning: "bg-amber-50 text-amber-600 ring-amber-100",
  neutral: "bg-slate-100 text-slate-500 ring-slate-200/60",
} as const;

/** Centred status message used by the public candidate pages (interview and job application). */
export function StatusCard({
  icon: Icon,
  tone,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  tone: keyof typeof iconTones;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className="animate-slide-up rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-xs sm:px-10 sm:py-12"
      aria-labelledby="candidate-status-title"
    >
      <div className={cn("mx-auto flex size-14 items-center justify-center rounded-full ring-8", iconTones[tone])}>
        <Icon className="size-7" aria-hidden />
      </div>
      <h1 id="candidate-status-title" className="mt-6 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
        {title}
      </h1>
      <div className="mx-auto mt-3 max-w-md space-y-2 text-[15px] leading-relaxed text-slate-600">{children}</div>
      {action ? <div className="mt-8 flex justify-center">{action}</div> : null}
    </section>
  );
}

/** Candidate-page shell with the interview copy (company header, translated labels). */
function InterviewShell({ children, companyName = null }: { children: ReactNode; companyName?: string | null }) {
  const t = useInterviewCopy();
  return (
    <CandidateLayout companyName={companyName} subtitle={t.onlineInterview} portalLabel={t.candidatePortal}>
      {children}
    </CandidateLayout>
  );
}

export function TerminalScreen({ reason, state }: { reason: TerminalReason; state?: CandidateInterviewState | null }) {
  const t = useInterviewCopy();
  const companyName = state?.company_name ?? null;
  const firstName = state?.candidate_first_name?.trim() || null;

  if (reason === "completed") {
    return (
      <InterviewShell companyName={companyName}>
        <StatusCard icon={CheckCircle2} tone="success" title={t.completedTitle}>
          <p className="font-medium text-slate-800">{t.thankYouTitle(firstName)}</p>
          <p>{t.completedBody(state?.job_title ?? null, companyName)}</p>
          <p className="text-sm text-slate-500">{t.safeToClose}</p>
        </StatusCard>
      </InterviewShell>
    );
  }

  if (reason === "expired") {
    return (
      <InterviewShell companyName={companyName}>
        <StatusCard icon={Clock} tone="warning" title={t.expiredTitle}>
          <p>{t.expiredBody}</p>
        </StatusCard>
      </InterviewShell>
    );
  }

  if (reason === "revoked") {
    return (
      <InterviewShell companyName={companyName}>
        <StatusCard icon={Link2Off} tone="neutral" title={t.revokedTitle}>
          <p>{t.revokedBody}</p>
        </StatusCard>
      </InterviewShell>
    );
  }

  return (
    <InterviewShell>
      <StatusCard icon={ShieldAlert} tone="warning" title={t.invalidTitle}>
        <p>{t.invalidBody}</p>
        <p className="text-sm text-slate-500">{t.invalidHint}</p>
      </StatusCard>
    </InterviewShell>
  );
}

export function IncompleteLinkScreen() {
  const t = useInterviewCopy();
  return (
    <InterviewShell>
      <StatusCard icon={Link2Off} tone="neutral" title={t.incompleteTitle}>
        <p>{t.incompleteBody}</p>
        <p className="text-sm text-slate-500">{t.incompleteHint}</p>
      </StatusCard>
    </InterviewShell>
  );
}

export function RetryScreen({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  const t = useInterviewCopy();
  return (
    <InterviewShell>
      <StatusCard
        icon={WifiOff}
        tone="neutral"
        title={t.loadFailedTitle}
        action={
          <Button size="lg" onClick={onRetry} loading={retrying} leftIcon={<RefreshCw />} className="h-12 px-6">
            {t.tryAgain}
          </Button>
        }
      >
        <p>{t.loadFailedBody}</p>
        <p className="text-sm text-slate-500">{t.answersSaved}</p>
      </StatusCard>
    </InterviewShell>
  );
}

export function LoadingScreen() {
  const t = useInterviewCopy();
  return (
    <InterviewShell>
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-slate-500" role="status">
        <Loader2 className="size-7 animate-spin text-indigo-600" aria-hidden />
        <p className="text-sm">{t.loading}</p>
      </div>
    </InterviewShell>
  );
}
