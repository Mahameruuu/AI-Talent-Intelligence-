import { Briefcase, CheckCircle2, MessagesSquare, Users, type LucideIcon } from "lucide-react";
import { StatCard } from "@/components/ui";
import type { DashboardKpis as Kpis } from "@/types/api";
import { formatNumber } from "@/utils/format";
import { formatRate } from "../dashboard-utils";

interface KpiItem {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
}

function kpiItems(kpis: Kpis): KpiItem[] {
  return [
    {
      label: "Open jobs",
      value: formatNumber(kpis.open_jobs),
      hint: `${formatNumber(kpis.total_jobs)} jobs in total`,
      icon: Briefcase,
    },
    {
      label: "Applicants",
      value: formatNumber(kpis.applicants),
      hint: `${formatNumber(kpis.applicants_this_week)} this week`,
      icon: Users,
    },
    {
      label: "AI interviews completed",
      value: formatNumber(kpis.interviews_completed),
      hint: `${formatNumber(kpis.waiting_for_decision)} waiting for decision`,
      icon: MessagesSquare,
    },
    {
      label: "Hired",
      value: formatNumber(kpis.hired),
      hint: kpis.hire_rate === null ? "No decisions yet" : `${formatRate(kpis.hire_rate)} hire rate`,
      icon: CheckCircle2,
    },
  ];
}

const LABELS = ["Open jobs", "Applicants", "AI interviews completed", "Hired"];

/** The four headline numbers. Without `kpis` it renders skeleton tiles so the layout doesn't jump. */
export function DashboardKpis({ kpis }: { kpis?: Kpis }) {
  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis
        ? kpiItems(kpis).map((item) => (
            <StatCard key={item.label} label={item.label} value={item.value} hint={item.hint} icon={item.icon} />
          ))
        : LABELS.map((label) => <StatCard key={label} label={label} value={null} loading />)}
    </section>
  );
}
