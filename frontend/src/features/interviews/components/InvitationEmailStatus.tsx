import { StatusBadge } from "@/components/ui";
import type { EmailLogEntry } from "@/types/api";
import { formatDateTime, formatRelative } from "@/utils/format";

/** Latest invitation email attempt: status badge, recipient, time and error. */
export function InvitationEmailStatus({ email }: { email: EmailLogEntry | null }) {
  if (!email) return <span className="font-normal text-slate-400">Not emailed</span>;
  return (
    <span className="flex flex-col items-end gap-1">
      <StatusBadge kind="email" value={email.status} />
      <span className="max-w-56 truncate text-xs font-normal text-slate-600" title={email.to_email}>
        {email.to_email}
      </span>
      <time dateTime={email.created_at} title={formatDateTime(email.created_at)} className="text-xs font-normal text-slate-500">
        {formatRelative(email.created_at)}
      </time>
      {email.status === "failed" && email.error ? (
        <span className="max-w-56 text-xs font-normal text-rose-700">{email.error}</span>
      ) : null}
      {email.status === "not_configured" ? (
        <span className="max-w-56 text-xs font-normal text-amber-700">SMTP isn&apos;t configured — the link was shared manually.</span>
      ) : null}
    </span>
  );
}
