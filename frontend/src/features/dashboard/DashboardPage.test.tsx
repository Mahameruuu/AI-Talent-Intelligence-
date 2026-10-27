import { screen, within } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { AnalyticsRedirect } from "@/app/redirects";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { DashboardData, DashboardMonth } from "@/types/api";
import { DashboardPage } from "./DashboardPage";
import { formatMonth } from "./dashboard-utils";

function months(fill: (index: number) => Partial<DashboardMonth> = () => ({})): DashboardMonth[] {
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(2025, 11 + index, 1));
    const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
    return { month, applicants: 0, jobs_opened: 0, interviews_completed: 0, hired: 0, ...fill(index) };
  });
}

function emptyDashboard(): DashboardData {
  return {
    has_data: false,
    has_demo_data: false,
    kpis: {
      open_jobs: 0,
      total_jobs: 0,
      applicants: 0,
      applicants_this_week: 0,
      interviews_completed: 0,
      waiting_for_decision: 0,
      hired: 0,
      decided: 0,
      hire_rate: null,
    },
    jobs: [],
    attention: [],
    monthly: months(),
  };
}

const fullDashboard: DashboardData = {
  has_data: true,
  has_demo_data: false,
  kpis: {
    open_jobs: 3,
    total_jobs: 8,
    applicants: 1234,
    applicants_this_week: 27,
    interviews_completed: 46,
    waiting_for_decision: 7,
    hired: 5,
    decided: 15,
    hire_rate: 33.3,
  },
  jobs: [
    {
      job_id: 11,
      title: "Data Scientist",
      status: "open",
      closes_on: "2026-10-30",
      auto_invite_on: "2026-10-31",
      applicants: 40,
      avg_match_score: 71.6,
      interviewed: 9,
      hired: 2,
    },
    {
      job_id: 12,
      title: "HR Generalist",
      status: "closed",
      closes_on: "2026-09-30",
      auto_invite_on: null,
      applicants: 12,
      avg_match_score: null,
      interviewed: 3,
      hired: 1,
    },
  ],
  attention: [
    {
      kind: "decision",
      session_id: 77,
      application_id: 41,
      candidate_name: "Budi Santoso",
      job_title: "Data Scientist",
      interview_score: 82,
      completed_at: "2026-10-25T03:00:00Z",
    },
    {
      kind: "job_closing",
      job_id: 11,
      job_title: "Data Scientist",
      closes_on: "2026-10-29",
      days_left: 2,
      applicants: 40,
    },
  ],
  monthly: months((index) => ({
    applicants: index === 11 ? 120 : index,
    jobs_opened: index === 10 ? 4 : 0,
    interviews_completed: index === 11 ? 18 : 0,
    hired: index === 11 ? 3 : 0,
  })),
};

function renderDashboard(payload: DashboardData) {
  const fetchMock = mockFetch((url) => {
    if (url.includes("/analytics/dashboard")) return jsonResponse(payload);
    return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
  });
  renderWithProviders(<DashboardPage />);
  return fetchMock;
}

/** The accessible data table behind a chart, found by its caption. */
function chartTable(title: string) {
  return screen.getByRole("table", { name: title });
}

describe("DashboardPage", () => {
  it("shows a friendly empty state with next steps when there is no data", async () => {
    renderDashboard(emptyDashboard());

    expect(await screen.findByText("No recruiting data yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a job/i })).toHaveAttribute("href", "/jobs/new");
    expect(screen.getByRole("link", { name: /share an application form/i })).toHaveAttribute("href", "/jobs");
    expect(screen.queryByText("Open jobs")).not.toBeInTheDocument();
    expect(screen.queryByText("Applicants per month")).not.toBeInTheDocument();
  });

  it("renders the four KPIs with their sub-labels", async () => {
    renderDashboard(fullDashboard);

    await screen.findByText("1,234");
    const kpis = screen.getByRole("region", { name: "Key figures" });
    const text = kpis.textContent ?? "";
    expect(within(kpis).getByText("Open jobs")).toBeInTheDocument();
    expect(text).toContain("8 jobs in total");
    expect(within(kpis).getByText("1,234")).toBeInTheDocument();
    expect(text).toContain("27 this week");
    expect(within(kpis).getByText("AI interviews completed")).toBeInTheDocument();
    expect(text).toContain("7 waiting for decision");
    expect(within(kpis).getByText("Hired")).toBeInTheDocument();
    expect(text).toContain("33% hire rate");
    expect(screen.getAllByText("Scores support HR decisions; final decisions are made by HR.")).toHaveLength(1);
  });

  it("renders the three monthly charts with 12 months of data", async () => {
    renderDashboard(fullDashboard);
    await screen.findByRole("heading", { name: "Applicants per month" });
    const last = formatMonth(fullDashboard.monthly[11]?.month ?? "");
    const previous = formatMonth(fullDashboard.monthly[10]?.month ?? "");
    expect(last).toMatch(/^[A-Z][a-z]{2} \d{4}$/);

    const applicants = chartTable("Applicants per month");
    expect(within(applicants).getAllByRole("row")).toHaveLength(13);
    expect(within(within(applicants).getByRole("rowheader", { name: last }).closest("tr") as HTMLElement).getByText("120"))
      .toBeInTheDocument();

    const jobs = chartTable("Jobs opened per month");
    expect(within(within(jobs).getByRole("rowheader", { name: previous }).closest("tr") as HTMLElement).getByText("4"))
      .toBeInTheDocument();

    const interviews = chartTable("AI interviews & hires per month");
    expect(within(interviews).getByRole("columnheader", { name: "AI interviews" })).toBeInTheDocument();
    expect(within(interviews).getByRole("columnheader", { name: "Hired" })).toBeInTheDocument();
    const lastRow = within(within(interviews).getByRole("rowheader", { name: last }).closest("tr") as HTMLElement);
    expect(lastRow.getByText("18")).toBeInTheDocument();
    expect(lastRow.getByText("3")).toBeInTheDocument();
  });

  it("links job rows to the candidates filtered by job", async () => {
    renderDashboard(fullDashboard);

    const table = await screen.findByRole("table", { name: "Jobs overview" });
    expect(within(table).getByRole("link", { name: "Data Scientist" })).toHaveAttribute("href", "/candidates?job_id=11");
    expect(within(table).getByRole("link", { name: "HR Generalist" })).toHaveAttribute("href", "/candidates?job_id=12");
    expect(within(table).getByText(/Auto-invite/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view all jobs/i })).toHaveAttribute("href", "/jobs");
  });

  it("lists interviews waiting for a decision and jobs closing soon", async () => {
    renderDashboard(fullDashboard);

    const decision = await screen.findByRole("link", { name: /Budi Santoso/ });
    expect(decision).toHaveAttribute("href", "/interviews/77/evaluation");
    expect(decision).toHaveTextContent("82");
    expect(screen.getByRole("link", { name: /Closes in 2 days/ })).toHaveAttribute("href", "/candidates?job_id=11");
    // 7 waiting but only 1 shown: offer the full list.
    expect(screen.getByRole("link", { name: "View all 7" })).toHaveAttribute("href", "/interviews");
  });

  it("shows 'All caught up' when nothing needs attention", async () => {
    renderDashboard({ ...fullDashboard, attention: [], kpis: { ...fullDashboard.kpis, waiting_for_decision: 0 } });

    expect(await screen.findByText("All caught up")).toBeInTheDocument();
  });
});

describe("navigation", () => {
  it("has Dashboard first and no Analytics item", () => {
    expect(NAV_ITEMS[0]).toMatchObject({ label: "Dashboard", to: "/" });
    expect(NAV_ITEMS.map((item) => item.label)).not.toContain("Analytics");
    expect(NAV_ITEMS.map((item) => item.label)).not.toContain("Overview");
  });

  it("redirects /analytics to the dashboard", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<p>Dashboard home</p>} />
        <Route path="/analytics" element={<AnalyticsRedirect />} />
      </Routes>,
      { route: "/analytics" },
    );
    expect(await screen.findByText("Dashboard home")).toBeInTheDocument();
  });
});
