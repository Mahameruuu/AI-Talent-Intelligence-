import { Check, ClipboardList, Copy, Mail, MailWarning, UserX } from "lucide-react";
import { useId, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  StatusBadge,
  buttonClasses,
} from "@/components/ui";
import { InvitationLinkField } from "@/features/interviews/components/InvitationLinkField";
import { TemplateOption } from "@/features/interviews/components/TemplateOption";
import { useCandidates } from "@/hooks/queries/candidates";
import { useTemplates } from "@/hooks/queries/interviews";
import { useBulkInvite } from "@/hooks/queries/jobs";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { getErrorMessage } from "@/services/api-client";
import type { BulkInviteResponse, BulkInviteResult } from "@/types/api";
import { pluralize } from "@/utils/format";
import { OPTIONS_PAGE_SIZE } from "@/hooks/queries/shared";
import { linksToShare, summarizeBulkInvite } from "../bulk-invite-utils";

export interface BulkInviteRecipient {
  applicationId: number;
  candidateId: number;
  candidateName: string;
}

export interface BulkInviteDialogProps {
  open: boolean;
  onClose: () => void;
  jobId: number;
  recipients: BulkInviteRecipient[];
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "success" | "info" | "neutral" }) {
  const toneClass =
    tone === "success" ? "text-emerald-700" : tone === "info" ? "text-indigo-700" : "text-slate-700";
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function ResultRow({ result }: { result: BulkInviteResult }) {
  const name = result.candidate_name ?? `Application #${result.application_id}`;
  const showLink = result.status === "invited" && result.email_status !== "sent" && Boolean(result.invitation_url);
  return (
    <li className="space-y-2 px-4 py-3" data-testid={`bulk-result-${result.application_id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-900">{name}</p>
          <p className="text-xs text-slate-500">{result.email ?? "No email address on file"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {result.status === "invited" ? (
            <Badge tone="success">
              <Check aria-hidden />
              Invited
            </Badge>
          ) : (
            <Badge tone="neutral">
              <UserX aria-hidden />
              Skipped
            </Badge>
          )}
          {result.status === "invited" && result.email_status ? (
            <StatusBadge kind="email" value={result.email_status} />
          ) : null}
          {result.status === "invited" && result.cv_questions ? (
            <Badge tone="violet" size="sm">
              {pluralize(result.cv_questions, "CV question")}
            </Badge>
          ) : null}
        </div>
      </div>
      {result.status === "skipped" ? (
        <p className="text-xs text-slate-600">
          <span className="font-medium">Reason:</span> {result.reason ?? "Not specified"}
        </p>
      ) : null}
      {result.status === "invited" && result.email_status === "failed" && result.email_error ? (
        <p className="text-xs text-rose-700">
          <span className="font-medium">Email error:</span> {result.email_error}
        </p>
      ) : null}
      {showLink && result.invitation_url ? (
        <InvitationLinkField
          url={result.invitation_url}
          label={`Interview link for ${name}`}
          hideLabel
          size="sm"
          copyLabel={`Copy link for ${name}`}
        />
      ) : null}
    </li>
  );
}

function BulkInviteResults({ response }: { response: BulkInviteResponse }) {
  const summary = summarizeBulkInvite(response);
  const toShare = linksToShare(response.results);
  const { copied, copy } = useCopyToClipboard();
  const [copyFailed, setCopyFailed] = useState(false);

  const copyAll = async () => {
    const text = toShare
      .map((result) => `${result.candidate_name ?? `Application #${result.application_id}`}${result.email ? ` <${result.email}>` : ""}: ${result.invitation_url ?? ""}`)
      .join("\n");
    const ok = await copy(text);
    setCopyFailed(!ok);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SummaryTile label="Invited" value={summary.invited} tone="success" />
        <SummaryTile label="Emailed" value={summary.emailed} tone="info" />
        <SummaryTile label="Skipped" value={summary.skipped} tone="neutral" />
      </div>

      {!response.smtp_configured ? (
        <Alert tone="warning" icon={MailWarning} title="Email isn't configured on the server (SMTP), so no emails were sent">
          Copy the invitation links below and share them with the candidates yourself.
        </Alert>
      ) : summary.emailFailed > 0 ? (
        <Alert tone="danger" title={`${pluralize(summary.emailFailed, "email")} couldn't be sent`}>
          Share those candidates&apos; links below manually, or check the Email log for details.
        </Alert>
      ) : null}

      {toShare.length > 0 ? (
        <Alert
          tone="warning"
          title="Copy these links now — for security they won't be shown again."
          action={
            <Button
              size="sm"
              variant={copied ? "secondary" : "primary"}
              leftIcon={copied ? <Check /> : <Copy />}
              onClick={() => void copyAll()}
            >
              {copied ? "Copied" : `Copy all links (${toShare.length})`}
            </Button>
          }
        >
          {pluralize(toShare.length, "candidate")} didn&apos;t receive an email. Links can&apos;t be retrieved later; if
          one gets lost, revoke that invitation and create a new one.
          {copyFailed ? (
            <span className="mt-1 block font-medium text-rose-700" role="alert">
              Couldn&apos;t copy automatically. Copy the links one by one.
            </span>
          ) : null}
        </Alert>
      ) : null}

      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Invitation results">
        {response.results.map((result) => (
          <ResultRow key={result.application_id} result={result} />
        ))}
      </ul>
    </div>
  );
}

function BulkInviteBody({ onClose, jobId, recipients }: Omit<BulkInviteDialogProps, "open">) {
  const radioName = useId();
  const sendEmailId = useId();
  const templatesQuery = useTemplates({ job_id: jobId });
  const candidatesQuery = useCandidates({ job_id: jobId, page: 1, page_size: OPTIONS_PAGE_SIZE });
  const bulkInvite = useBulkInvite(jobId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  // Held only while the dialog is open; the body unmounts on close, which drops the URLs from memory.
  const [response, setResponse] = useState<BulkInviteResponse | null>(null);

  const emailByCandidate = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const candidate of candidatesQuery.data?.items ?? []) map.set(candidate.id, candidate.email);
    return map;
  }, [candidatesQuery.data]);
  const emailsLoaded = candidatesQuery.isSuccess;
  const missingEmail = emailsLoaded
    ? recipients.filter((recipient) => !emailByCandidate.get(recipient.candidateId))
    : [];

  const forJob = (templatesQuery.data ?? []).filter((template) => template.job_id === jobId);
  const approved = forJob.filter((template) => template.status === "approved");
  const draftCount = forJob.length - approved.length;
  const effectiveSelectedId =
    selectedId !== null && approved.some((template) => template.id === selectedId)
      ? selectedId
      : approved.length === 1
        ? (approved[0]?.id ?? null)
        : null;

  const send = () => {
    if (effectiveSelectedId === null || recipients.length === 0) return;
    bulkInvite.mutate(
      {
        template_id: effectiveSelectedId,
        application_ids: recipients.map((recipient) => recipient.applicationId),
        send_email: sendEmail,
      },
      { onSuccess: (result) => setResponse(result) },
    );
  };

  const close = () => {
    setResponse(null);
    onClose();
  };

  let body: ReactNode;
  if (response) {
    body = <BulkInviteResults response={response} />;
  } else if (templatesQuery.isPending) {
    body = (
      <div className="space-y-3" aria-busy="true" aria-label="Loading templates">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  } else if (templatesQuery.isError) {
    body = (
      <ErrorState
        compact
        error={templatesQuery.error}
        title="Couldn't load interview templates"
        onRetry={() => void templatesQuery.refetch()}
        retrying={templatesQuery.isFetching}
      />
    );
  } else if (approved.length === 0) {
    body = (
      <EmptyState
        compact
        icon={ClipboardList}
        title="No approved interview template for this job"
        description={
          draftCount > 0
            ? `Candidates can only be invited with an approved template. This job has ${pluralize(draftCount, "draft template")} waiting for approval.`
            : "Candidates can only be invited with an approved template. Create one for this job (start from the AI suggestion) and approve it first."
        }
        action={
          <>
            <Link
              to={`/interviews/templates?job_id=${jobId}`}
              onClick={close}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              View templates
            </Link>
            <Link
              to={`/interviews/templates/new?job_id=${jobId}`}
              onClick={close}
              className={buttonClasses({ variant: "primary", size: "sm" })}
            >
              Create template
            </Link>
          </>
        }
      />
    );
  } else {
    body = (
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-slate-700">Approved interview template</legend>
          {approved.map((template) => (
            <TemplateOption
              key={template.id}
              template={template}
              name={radioName}
              selected={template.id === effectiveSelectedId}
              onSelect={() => setSelectedId(template.id)}
            />
          ))}
        </fieldset>

        <section aria-labelledby={`${radioName}-recipients`} className="space-y-2">
          <h3 id={`${radioName}-recipients`} className="text-sm font-medium text-slate-700">
            Recipients ({recipients.length})
          </h3>
          <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 scrollbar-thin">
            {recipients.map((recipient) => {
              const email = emailByCandidate.get(recipient.candidateId);
              return (
                <li key={recipient.applicationId} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-slate-900">{recipient.candidateName}</span>
                  {!emailsLoaded ? (
                    <Skeleton className="h-4 w-36" />
                  ) : email ? (
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-slate-500">
                      <Mail className="size-3.5 shrink-0" aria-hidden />
                      {email}
                    </span>
                  ) : (
                    <Badge tone="warning" size="sm">
                      No email
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
          {missingEmail.length > 0 ? (
            <Alert tone="warning" title={`${pluralize(missingEmail.length, "candidate")} without an email address`}>
              They will still be invited; you&apos;ll get their private link after sending so you can share it yourself.
            </Alert>
          ) : null}
        </section>

        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-4 py-3">
          <Checkbox
            id={sendEmailId}
            checked={sendEmail}
            onChange={(event) => setSendEmail(event.target.checked)}
            className="mt-0.5"
          />
          <label htmlFor={sendEmailId} className="min-w-0 text-sm">
            <span className="block font-medium text-slate-800">Send invitation emails</span>
            <span className="block text-xs text-slate-500">
              Each candidate receives their own private link by email. Links that aren&apos;t emailed are shown once
              after sending so you can share them manually.
            </span>
          </label>
        </div>

        {bulkInvite.isError ? (
          <Alert tone="danger" title="Couldn't send the invitations">
            {getErrorMessage(bulkInvite.error)}
          </Alert>
        ) : null}
      </div>
    );
  }

  const footer = response ? (
    <Button onClick={close}>Done</Button>
  ) : (
    <>
      <Button variant="secondary" onClick={close} disabled={bulkInvite.isPending}>
        Cancel
      </Button>
      {approved.length > 0 ? (
        <Button
          onClick={send}
          loading={bulkInvite.isPending}
          disabled={effectiveSelectedId === null || recipients.length === 0}
          leftIcon={<Mail />}
        >
          {sendEmail ? `Send ${pluralize(recipients.length, "invitation")}` : `Create ${pluralize(recipients.length, "invitation")}`}
        </Button>
      ) : null}
    </>
  );

  return (
    <Dialog
      open
      onClose={close}
      title={response ? "Invitation results" : "Invite to AI interview"}
      description={
        response
          ? undefined
          : `Invite ${pluralize(recipients.length, "candidate")} to a voice AI interview. Each gets a private link; personalised CV questions are generated per candidate.`
      }
      footer={footer}
      // Once links are shown, only the explicit "Done" button closes the dialog so they aren't lost by a stray click.
      dismissible={!response && !bulkInvite.isPending}
      size="lg"
    >
      {body}
    </Dialog>
  );
}

/** Choose an approved template, invite many candidates at once and show per-candidate results. */
export function BulkInviteDialog({ open, onClose, jobId, recipients }: BulkInviteDialogProps) {
  if (!open) return null;
  return <BulkInviteBody onClose={onClose} jobId={jobId} recipients={recipients} />;
}
