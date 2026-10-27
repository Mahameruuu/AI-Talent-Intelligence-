import { BarChart3, ClipboardList, Info, Plus } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, DemoDataBanner, EmptyState, QueryState, Skeleton, buttonClasses } from "@/components/ui";
import { useDashboard } from "@/hooks/queries/analytics";
import { useDocumentTitle } from "@/hooks/use-document-title";
import type { DashboardData } from "@/types/api";
import { AttentionCard } from "./components/AttentionCard";
import { DashboardKpis } from "./components/DashboardKpis";
import { JobsOverviewCard } from "./components/JobsOverviewCard";
import { MonthlyCharts } from "./components/MonthlyCharts";

export function DashboardPage() {
  useDocumentTitle("Dashboard");
  const dashboardQuery = useDashboard();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Here's how hiring is going."
        actions={
          <Link to="/jobs/new" className={buttonClasses()}>
            <Plus aria-hidden />
            New job
          </Link>
        }
      />
      <QueryState
        query={dashboardQuery}
        loading={<DashboardSkeleton />}
        isEmpty={(data) => !data.has_data}
        empty={<DashboardEmpty />}
      >
        {(data) => <DashboardContent data={data} />}
      </QueryState>
    </div>
  );
}

function DashboardContent({ data }: { data: DashboardData }) {
  return (
    <div className="space-y-6">
      {data.has_demo_data ? <DemoDataBanner /> : null}
      <DashboardKpis kpis={data.kpis} />
      <MonthlyCharts months={data.monthly} />
      {/* Full width each: the jobs table needs the room for its status column. */}
      <JobsOverviewCard jobs={data.jobs} totalJobs={data.kpis.total_jobs} />
      <AttentionCard items={data.attention} waitingTotal={data.kpis.waiting_for_decision} />
      <p className="flex items-start gap-2 text-xs text-slate-500">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        Scores support HR decisions; final decisions are made by HR.
      </p>
    </div>
  );
}

function DashboardEmpty() {
  return (
    <Card>
      <EmptyState
        icon={BarChart3}
        title="No recruiting data yet"
        description="Create a job and share its application form. Applicants, interviews and hires show up here."
        action={
          <>
            <Link to="/jobs/new" className={buttonClasses()}>
              <Plus aria-hidden />
              Create a job
            </Link>
            <Link to="/jobs" className={buttonClasses({ variant: "secondary" })}>
              <ClipboardList aria-hidden />
              Share an application form
            </Link>
          </>
        }
      />
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <DashboardKpis />
      <Skeleton className="h-72 w-full rounded-xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}
