import { ClipboardList, Link2, MailCheck } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorState,
  Skeleton,
  buttonClasses,
} from "@/components/ui";
import { useInviteCandidate, useTemplates } from "@/hooks/queries/interviews";
import { getErrorMessage } from "@/services/api-client";
import type { EmailLogEntry, InterviewInvitation } from "@/types/api";
import { formatDateTime, formatRelative, pluralize } from "@/utils/format";
import { InvitationLinkField } from "./InvitationLinkField";
import { TemplateOption } from "./TemplateOption";

export interface InviteCandidateDialogProps {
  open: boolean;
  onClose: () => void;
  applicationId: number;
  jobId: number;
  candidateName: string;
}

function EmailResultAlert({ email, candidateName }: { email: EmailLogEntry | null; candidateName: string }) {
  if (!email) {
    return (
      <Alert tone="info" title="No email was sent">
        You chose to share the link yourself. Send it to {candidateName}, for example by email or chat.
      </Alert>
    );
  }
  if (email.status === "sent") {
    return (
      <Alert tone="success" icon={MailCheck} title={`Invitation email sent to ${email.to_email}`}>
        Sent {formatDateTime(email.created_at)}. You can still copy the link below as a backup.
      </Alert>
    );
  }
  if (email.status === "not_configured") {
    return (
      <Alert tone="warning" title="Email isn't configured on the server (SMTP), so no email was sent">
        Copy the link below and share it with {candidateName} yourself.
      </Alert>
    );
  }
  return (
    <Alert tone="danger" title={`The invitation email to ${email.to_email} couldn't be sent`}>
      {email.error ? <span className="block">{email.error}</span> : null}
      Copy the link below and share it with {candidateName} yourself.
    </Alert>
  );
}

function InvitationResult({ invitation, candidateName }: { invitation: InterviewInvitation; candidateName: string }) {
  return (
    <div className="space-y-4">
      <Alert tone="success" title={`Invitation created for ${candidateName}`}>
        The private link expires <strong className="font-semibold">{formatDateTime(invitation.expires_at)}</strong> (
        {formatRelative(invitation.expires_at)}).
      </Alert>
      <EmailResultAlert email={invitation.email} candidateName={candidateName} />
      <InvitationLinkField url={invitation.invitation_url} autoFocus />
      <Alert tone="warning" title="Copy this link now — for security it won't be shown again.">
        The link can&apos;t be retrieved later. If it gets lost, revoke this invitation and create a new one.
      </Alert>
    </div>
  );
}

function InviteDialogBody({ onClose, applicationId, jobId, candidateName }: Omit<InviteCandidateDialogProps, "open">) {
  const radioName = useId();
  const templatesQuery = useTemplates({ job_id: jobId });
  const inviteMutation = useInviteCandidate(applicationId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sendEmail, setSendEmail] = useState(true);
  const sendEmailId = useId();
  // Held only while the dialog is open; the body unmounts on close, which drops the URL from memory.
  const [invitation, setInvitation] = useState<InterviewInvitation | null>(null);

  const forJob = (templatesQuery.data ?? []).filter((template) => template.job_id === jobId);
  const approved = forJob.filter((template) => template.status === "approved");
  const draftCount = forJob.length - approved.length;
  const effectiveSelectedId =
    selectedId !== null && approved.some((template) => template.id === selectedId)
      ? selectedId
      : approved.length === 1
        ? (approved[0]?.id ?? null)
        : null;

  const createInvitation = () => {
    if (effectiveSelectedId === null) return;
    inviteMutation.mutate({ templateId: effectiveSelectedId, sendEmail }, { onSuccess: (result) => setInvitation(result) });
  };

  const close = () => {
    setInvitation(null);
    onClose();
  };

  let body: ReactNode;
  if (invitation) {
    body = <InvitationResult invitation={invitation} candidateName={candidateName} />;
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
            : "Candidates can only be invited with an approved template. Create one for this job and approve it first."
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
      <div className="space-y-4">
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
        <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 px-4 py-3">
          <Checkbox
            id={sendEmailId}
            checked={sendEmail}
            onChange={(event) => setSendEmail(event.target.checked)}
            className="mt-0.5"
          />
          <label htmlFor={sendEmailId} className="min-w-0 text-sm">
            <span className="block font-medium text-slate-800">Send invitation email</span>
            <span className="block text-xs text-slate-500">
              Emails the private link to the candidate&apos;s address on file. Either way, the link is shown once so you
              can also share it yourself.
            </span>
          </label>
        </div>
        <p className="flex gap-2 text-xs text-slate-500">
          <Link2 className="size-3.5 shrink-0" aria-hidden />
          A private link is generated for this candidate. They need no account: they open the link, read the privacy
          notice and give consent before starting.
        </p>
        {inviteMutation.isError ? (
          <Alert tone="danger" title="Couldn't create the invitation">
            {getErrorMessage(inviteMutation.error)}
          </Alert>
        ) : null}
      </div>
    );
  }

  const footer = invitation ? (
    <Button onClick={close}>Done</Button>
  ) : (
    <>
      <Button variant="secondary" onClick={close} disabled={inviteMutation.isPending}>
        Cancel
      </Button>
      {approved.length > 0 ? (
        <Button onClick={createInvitation} loading={inviteMutation.isPending} disabled={effectiveSelectedId === null}>
          Create invitation
        </Button>
      ) : null}
    </>
  );

  return (
    <Dialog
      open
      onClose={close}
      title={invitation ? "Invitation link" : "Invite to AI interview"}
      description={invitation ? undefined : `Choose the interview template for ${candidateName}.`}
      footer={footer}
      // Once the link is shown, only the explicit "Done" button closes the dialog so it isn't lost by a stray click.
      dismissible={!invitation && !inviteMutation.isPending}
      size="md"
    >
      {body}
    </Dialog>
  );
}

/** Two-step dialog: choose an approved template, then show the one-time invitation link. */
export function InviteCandidateDialog({ open, onClose, applicationId, jobId, candidateName }: InviteCandidateDialogProps) {
  if (!open) return null;
  return <InviteDialogBody onClose={onClose} applicationId={applicationId} jobId={jobId} candidateName={candidateName} />;
}
