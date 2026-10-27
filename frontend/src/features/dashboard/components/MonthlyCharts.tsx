import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "@/components/ui";
import type { DashboardMonth } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatMonth } from "../dashboard-utils";

/** Restrained palette: indigo for volume, emerald for hires (the one "good outcome" series). */
const COLORS = {
  primary: "#4f46e5", // indigo-600
  hired: "#059669", // emerald-600
  grid: "#e2e8f0", // slate-200
  tick: "#64748b", // slate-500
  cursor: "rgba(79, 70, 229, 0.06)",
} as const;

const AXIS_TICK = { fill: COLORS.tick, fontSize: 12 } as const;

interface Series {
  key: keyof Omit<DashboardMonth, "month">;
  name: string;
  color: string;
}

interface MonthlyChartCardProps {
  title: string;
  description: string;
  months: DashboardMonth[];
  series: Series[];
  height?: number;
  className?: string;
}

function MonthlyChartCard({ title, description, months, series, height = 220, className }: MonthlyChartCardProps) {
  const data = months.map((row) => ({ ...row, label: formatMonth(row.month) }));
  const total = (key: Series["key"]) => months.reduce((sum, row) => sum + row[key], 0);
  const summary = series.map((s) => `${total(s.key)} ${s.name.toLowerCase()}`).join(", ");

  return (
    <Card className={cn("flex min-w-0 flex-col", className)}>
      <CardHeader title={title} description={description} />
      <figure className="px-2 pb-4 pt-3 sm:px-4" aria-label={`${title}: ${summary} in the last 12 months`}>
        <div style={{ height }} aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barGap={2} barCategoryGap="24%">
              <CartesianGrid vertical={false} stroke={COLORS.grid} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: COLORS.grid }}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                cursor={{ fill: COLORS.cursor }}
                contentStyle={{ borderRadius: 8, borderColor: COLORS.grid, fontSize: 12 }}
              />
              {series.length > 1 ? <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} /> : null}
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  fill={s.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* Accessible data behind the chart. */}
        <table className="sr-only">
          <caption>{title}</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              {series.map((s) => (
                <th key={s.key} scope="col">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.month}>
                <th scope="row">{row.label}</th>
                {series.map((s) => (
                  <td key={s.key}>{row[s.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </figure>
    </Card>
  );
}

export function MonthlyCharts({ months }: { months: DashboardMonth[] }) {
  return (
    <section aria-label="Monthly trends" className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <MonthlyChartCard
        title="Applicants per month"
        description="Applications received, last 12 months"
        months={months}
        series={[{ key: "applicants", name: "Applicants", color: COLORS.primary }]}
        height={240}
        className="lg:col-span-2"
      />
      <MonthlyChartCard
        title="Jobs opened per month"
        description="Jobs that opened for applications"
        months={months}
        series={[{ key: "jobs_opened", name: "Jobs opened", color: COLORS.primary }]}
      />
      <MonthlyChartCard
        title="AI interviews & hires per month"
        description="Completed AI interviews and accepted candidates"
        months={months}
        series={[
          { key: "interviews_completed", name: "AI interviews", color: COLORS.primary },
          { key: "hired", name: "Hired", color: COLORS.hired },
        ]}
      />
    </section>
  );
}
