import { CalendarClock, CheckCircle2, ChevronRight, MessagesSquare } from "lucide-react";
import { Link } from "react-router";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import type { DashboardAttentionItem } from "@/types/api";
import { formatDayTime, formatNumber, formatRelative, formatScore, pluralize } from "@/utils/format";
import { candidatesHref, closesIn } from "../dashboard-utils";

function itemContent(item: DashboardAttentionItem) {
  if (item.kind === "decision") {
    return {
      key: `decision-${item.session_id}`,
      to: `/interviews/${item.session_id}/evaluation`,
      icon: <MessagesSquare className="size-4" aria-hidden />,
      iconClass: "bg-indigo-50 text-indigo-700",
      title: item.candidate_name,
      detail: `${item.job_title} · Interview done ${item.completed_at ? formatRelative(item.completed_at) : ""}`.trim(),
      aside: (
        <span className="text-right">
          <span className="block text-sm font-semibold tabular-nums text-slate-900">
            {formatScore(item.interview_score)}
            {item.interview_score !== null ? <span className="text-xs font-normal text-slate-500">/100</span> : null}
          </span>
          <span className="block text-xs text-slate-500">Needs decision</span>
        </span>
      ),
    };
  }
  return {
    key: `job-${item.job_id}`,
    to: candidatesHref(item.job_id),
    icon: <CalendarClock className="size-4" aria-hidden />,
    iconClass: "bg-amber-50 text-amber-700",
    title: item.job_title,
    detail: `${closesIn(item.days_left)} (${formatDayTime(item.closes_on, item.closes_time)})`,
    aside: (
      <span className="text-right text-xs text-slate-500">
        {pluralize(item.applicants, "applicant")}
      </span>
    ),
  };
}

export function AttentionCard({ items, waitingTotal }: { items: DashboardAttentionItem[]; waitingTotal: number }) {
  const shownDecisions = items.filter((item) => item.kind === "decision").length;
  return (
    <Card className="flex min-w-0 flex-col">
      <CardHeader
        title="Needs your attention"
        description="Interviews waiting for your decision and jobs closing soon"
        actions={
          waitingTotal > shownDecisions ? (
            <Link to="/interviews" className="text-sm font-medium text-indigo-700 hover:underline">
              View all {formatNumber(waitingTotal)}
            </Link>
          ) : null
        }
      />
      {items.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="All caught up"
          description="No interviews are waiting for a decision and no jobs close in the next 3 days."
          compact
          className="py-10"
        />
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((item) => {
            const content = itemContent(item);
            return (
              <li key={content.key}>
                <Link
                  to={content.to}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                >
                  <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${content.iconClass}`}>
                    {content.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{content.title}</span>
                    <span className="block truncate text-xs text-slate-500">{content.detail}</span>
                  </span>
                  {content.aside}
                  <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
