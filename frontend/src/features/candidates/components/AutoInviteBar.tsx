import { Bot, CheckCircle2, Send, Settings, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Button, buttonClasses, ConfirmDialog, useToast } from "@/components/ui";
import { useRunAutoInvite } from "@/hooks/queries/jobs";
import { getErrorMessage, isApiError } from "@/services/api-client";
import type { Job } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDateTimeWib, formatDateWib, pluralize } from "@/utils/format";

function templatesPath(jobId: number): string {
  return `/interviews/templates?job_id=${jobId}`;
}

/**
 * One-line status of a job's automatic AI-interview invitations above its applicants (managers only),
 * with "Settings" and "Send now".
 */
export function AutoInviteBar({ job }: { job: Job }) {
  const toast = useToast();
  const runAutoInvite = useRunAutoInvite();
  const [confirming, setConfirming] = useState(false);
  // Set when "Send now" found no approved template, before the job list refreshes.
  const [templateMissing, setTemplateMissing] = useState(false);
  const autoInvite = job.auto_invite;
  if (!autoInvite) return null;

  const status = templateMissing ? "waiting_template" : autoInvite.status;
  const topN = autoInvite.top_n;

  const sendNow = () =>
    runAutoInvite.mutate(job.id, {
      onSuccess: (updated) => {
        setConfirming(false);
        const invited = updated.auto_invite?.invited_count ?? 0;
        if (invited > 0) toast.success(`${pluralize(invited, "applicant")} invited`, "Each gets an email with their AI interview link.");
        else toast.toast({ tone: "info", title: "No one new to invite", description: "Everyone eligible has already been invited." });
      },
      onError: (error) => {
        setConfirming(false);
        if (isApiError(error) && error.code === "no_approved_template") {
          setTemplateMissing(true);
          toast.error("Approve an interview template first", "Open Interview templates for this job and approve one.");
          return;
        }
        toast.error("Couldn't send invitations", getErrorMessage(error));
      },
    });

  let tone: "default" | "warning" | "danger" | "muted" = "default";
  let icon: ReactNode = <Bot aria-hidden />;
  let message: ReactNode;
  switch (status) {
    case "scheduled":
      message = (
        <>
          AI interview invitations go out automatically{" "}
          {autoInvite.timing === "on_close" ? "right after applications close, on" : "on"}{" "}
          <span className="font-medium text-slate-900">{formatDateTimeWib(autoInvite.send_at)}</span>
          {autoInvite.timing === "on_close" ? "," : ""} to the top {pluralize(topN, "applicant")}.
        </>
      );
      break;
    case "sent":
      icon = <CheckCircle2 aria-hidden className="text-emerald-600" />;
      message = (
        <>
          Invitations sent on {formatDateWib(autoInvite.ran_at)} · {pluralize(autoInvite.invited_count ?? 0, "applicant")}{" "}
          invited.
        </>
      );
      break;
    case "waiting_template":
      tone = "warning";
      icon = <TriangleAlert aria-hidden />;
      message = (
        <>
          Approve an interview template for this job so invitations can be sent.{" "}
          <Link to={templatesPath(job.id)} className="font-medium underline underline-offset-2 hover:text-amber-900">
            Interview templates
          </Link>
        </>
      );
      break;
    case "no_deadline":
      tone = "muted";
      message = "Set a closing date so invitations can be sent automatically.";
      break;
    case "failed":
      tone = "danger";
      icon = <TriangleAlert aria-hidden />;
      message = "Automatic invitations failed — we'll retry soon. You can also send them now.";
      break;
    default:
      tone = "muted";
      message = "Automatic invitations are off.";
  }

  return (
    <section
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 text-sm sm:px-5",
        tone === "warning" && "border-amber-200 bg-amber-50 text-amber-800",
        tone === "danger" && "border-rose-200 bg-rose-50 text-rose-800",
        tone === "muted" && "border-slate-100 bg-slate-50 text-slate-500",
        tone === "default" && "border-indigo-100 bg-indigo-50/50 text-slate-700",
      )}
      aria-label="AI interview invitations"
    >
      <p className="flex min-w-0 flex-1 items-start gap-2 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0">
        {icon}
        <span>{message}</span>
      </p>
      <div className="flex items-center gap-2">
        <Link to={`/jobs/${job.id}/edit`} className={buttonClasses({ variant: "ghost", size: "sm" })}>
          <Settings aria-hidden />
          Settings
        </Link>
        {status !== "waiting_template" ? (
          <Button size="sm" variant="secondary" leftIcon={<Send />} onClick={() => setConfirming(true)}>
            Send now
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={sendNow}
        title={`Invite the top ${pluralize(topN, "eligible applicant")} now?`}
        description="Each gets an email with their AI interview link. Applicants who were already invited are skipped."
        confirmLabel="Send invitations"
        loading={runAutoInvite.isPending}
      />
    </section>
  );
}
