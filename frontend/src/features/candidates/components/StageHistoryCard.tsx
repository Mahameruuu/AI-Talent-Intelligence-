import { History } from "lucide-react";
import { Card, CardContent, CardHeader, StatusBadge } from "@/components/ui";
import type { Application } from "@/types/api";
import { formatDateTime } from "@/utils/format";

/** Every stage change of this application, newest first. */
export function StageHistoryCard({
  application,
}: {
  application: Application;
}) {
  const entries = [...application.stage_history].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  return (
    <Card>
      <CardHeader
        title="Stage history"
        description={application.job_title}
        icon={<History />}
      />
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">
            No stage changes recorded yet.
          </p>
        ) : (
          <ol className="relative space-y-5 border-l border-slate-200 pl-5">
            {entries.map((entry, index) => (
              <li key={`${entry.created_at}-${index}`} className="relative">
                <span
                  className="absolute -left-[1.6rem] top-1 size-2.5 rounded-full bg-indigo-500 ring-4 ring-white"
                  aria-hidden
                />
                <div className="flex flex-wrap items-center gap-1.5 text-sm">
                  {entry.from_stage ? (
                    <>
                      <StatusBadge
                        kind="stage"
                        value={entry.from_stage}
                        size="sm"
                      />
                      <span className="text-slate-400" aria-label="to">
                        →
                      </span>
                    </>
                  ) : null}
                  <StatusBadge kind="stage" value={entry.to_stage} size="sm" />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {formatDateTime(entry.created_at)} ·{" "}
                  {entry.changed_by ?? "System"}
                </p>
                {entry.note ? (
                  <p className="mt-1 text-sm text-slate-700">{entry.note}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
