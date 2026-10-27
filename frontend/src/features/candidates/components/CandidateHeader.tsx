import { Mail, MapPin, Phone, Send, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, DemoBadge, DropdownMenu, NotFoundInCv, ScoreBadge } from "@/components/ui";
import { applicationScore } from "@/features/shortlist/shortlist-utils";
import type { Application, Candidate } from "@/types/api";
import { initials } from "@/utils/format";
import { matchCategory } from "../candidate-list-utils";

export interface CandidateHeaderProps {
  candidate: Candidate;
  application: Application | undefined;
  /** Invite to the AI interview. */
  onInvite: () => void;
  /** Permanently delete the candidate. */
  onDelete: () => void;
  /** Application row (job, stage, source). */
  children?: ReactNode;
}

function ContactItem({ icon, value, href }: { icon: ReactNode; value: string | null; href?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-slate-600">
      <span className="text-slate-400 [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      {value ? (
        href ? (
          <a href={href} className="truncate hover:text-indigo-700 hover:underline">
            {value}
          </a>
        ) : (
          <span className="truncate">{value}</span>
        )
      ) : (
        <NotFoundInCv />
      )}
    </span>
  );
}

export function CandidateHeader({ candidate, application, onInvite, onDelete, children }: CandidateHeaderProps) {
  const score = application ? applicationScore(application) : null;
  const category = matchCategory(score);
  return (
    <Card>
      <div className="flex flex-col gap-5 px-5 py-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-lg font-semibold text-indigo-800"
            aria-hidden
          >
            {initials(candidate.full_name)}
          </div>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{candidate.full_name}</h1>
              {candidate.is_demo ? <DemoBadge /> : null}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              <ContactItem icon={<Mail />} value={candidate.email} href={candidate.email ? `mailto:${candidate.email}` : undefined} />
              <ContactItem icon={<Phone />} value={candidate.phone} href={candidate.phone ? `tel:${candidate.phone}` : undefined} />
              <ContactItem icon={<MapPin />} value={candidate.location} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center md:flex-col md:items-end lg:flex-row lg:items-center">
          {application ? (
            <div className="flex items-center gap-3 md:text-right">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Match score</p>
                <p className="text-sm font-medium text-slate-700">{category ?? "Not screened yet"}</p>
              </div>
              <ScoreBadge score={score} size="lg" showMax />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {application && !application.decision ? (
              <Button onClick={onInvite} leftIcon={<Send />}>
                Invite to AI interview
              </Button>
            ) : null}
            <DropdownMenu
              label={`More actions for ${candidate.full_name}`}
              variant="secondary"
              size="icon"
              items={[{ label: "Delete candidate", icon: <Trash2 />, tone: "danger", onSelect: onDelete }]}
            />
          </div>
        </div>
      </div>
      {children}
    </Card>
  );
}
