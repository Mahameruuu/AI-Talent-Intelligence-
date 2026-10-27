import { Briefcase } from "lucide-react";
import { useId } from "react";
import { Link } from "react-router";
import { Select, StatusBadge } from "@/components/ui";
import type { Application, Candidate } from "@/types/api";
import { formatDate, formatDateTime } from "@/utils/format";
import { STAGE_LABELS } from "@/utils/labels";

export interface ApplicationBarProps {
  candidate: Candidate;
  selectedId: number;
  application: Application | undefined;
  onSelect: (applicationId: number) => void;
}

/** The applied job (a selector when the candidate applied to several jobs), its stage and where it came from. */
export function ApplicationBar({ candidate, selectedId, application, onSelect }: ApplicationBarProps) {
  const selectId = useId();
  const selected = candidate.applications.find((item) => item.id === selectedId);
  const multiple = candidate.applications.length > 1;
  const appliedAt = application ? (application.submitted_at ?? application.created_at) : null;
  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <Briefcase className="size-4 shrink-0 text-slate-400" aria-hidden />
        {multiple ? (
          <>
            <label htmlFor={selectId} className="text-sm text-slate-500">
              Applied for
            </label>
            <Select
              id={selectId}
              className="w-auto max-w-72"
              value={String(selectedId)}
              onChange={(event) => onSelect(Number(event.target.value))}
            >
              {candidate.applications.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.job_title} · {STAGE_LABELS[item.stage]}
                </option>
              ))}
            </Select>
          </>
        ) : (
          <p className="min-w-0 text-sm text-slate-500">
            Applied for{" "}
            <Link
              to={`/candidates?job_id=${selected?.job_id ?? application?.job_id ?? ""}`}
              title="All applicants for this job"
              className="font-medium text-slate-900 hover:text-indigo-700 hover:underline"
            >
              {selected?.job_title ?? application?.job_title}
            </Link>
          </p>
        )}
        {application ? (
          <>
            <StatusBadge kind="stage" value={application.stage} />
            <span title={application.submitted_at ? `Submitted ${formatDateTime(application.submitted_at)}` : undefined}>
              <StatusBadge kind="source" value={application.source} />
            </span>
            {appliedAt ? <span className="text-xs text-slate-500">{formatDate(appliedAt)}</span> : null}
            {multiple ? (
              <Link
                to={`/candidates?job_id=${application.job_id}`}
                className="text-sm font-medium text-indigo-700 hover:underline"
              >
                All applicants
              </Link>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
