import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { ApplicationForm, Job, Paginated } from "@/types/api";
import { JobDetailRedirect } from "@/app/redirects";
import { JobFormPage } from "./JobFormPage";
import { JobListPage } from "./JobListPage";

const job: Job = {
  id: 5,
  title: "Data Scientist",
  department: "Data",
  location: "Jakarta",
  description: "Build models.",
  required_skills: ["Python", "SQL", "Statistics", "Machine Learning"],
  preferred_skills: [],
  min_experience_years: 2,
  education_level: null,
  education_field: null,
  required_certifications: [],
  status: "open",
  employment_type: "contract",
  salary_min: 12000000,
  salary_max: 18000000,
  salary_visible: false,
  weights: { required_skills: 40, preferred_skills: 10, experience: 20, education: 10, certifications: 5, semantic: 15, screening_questions: 0 },
  is_demo: true,
  candidate_count: 3,
  opens_on: null,
  closes_on: null,
  application_window: null,
  days_left: null,
  opens_time: null,
  closes_time: null,
  opens_at: null,
  closes_at: null,
  auto_invite: {
    enabled: false,
    top_n: 10,
    min_score: null,
    send_at: null,
    timing: "next_morning",
    status: "disabled",
    template_id: null,
    template_name: null,
    ran_at: null,
    invited_count: null,
    skipped: null,
    error: null,
  },
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-02T08:00:00Z",
};

const notFound = () => jsonResponse({ error: { code: "not_found", message: "Job not found" } }, 404);

const otherJob: Job = { ...job, id: 6, title: "QA Engineer", candidate_count: 0, is_demo: false };

const liveForm: ApplicationForm = {
  id: 9,
  job_id: 5,
  job_title: "Data Scientist",
  slug: "k3J9xQ2mP0aB",
  public_url: "http://localhost:5173/apply/k3J9xQ2mP0aB",
  title: "Apply: Data Scientist",
  intro: null,
  built_in_fields: [],
  fields: [],
  status: "published",
  accepting_applications: true,
  closed_reason: null,
  job_opens_on: null,
  job_closes_on: null,
  job_opens_time: null,
  job_closes_time: null,
  job_opens_at: null,
  job_closes_at: null,
  closes_at: null,
  published_at: "2026-10-10T08:00:00Z",
  submission_count: 12,
  created_at: "2026-10-09T08:00:00Z",
  updated_at: "2026-10-10T08:00:00Z",
};

function mockJobList() {
  const page: Paginated<Job> = { items: [job, otherJob], total: 2, page: 1, page_size: 20 };
  return mockFetch((url) => {
    if (url.includes("/forms")) return jsonResponse([liveForm]);
    if (url.includes("/jobs")) return jsonResponse(page);
    return notFound();
  });
}

function renderList() {
  return renderWithProviders(
    <Routes>
      <Route path="/jobs" element={<JobListPage />} />
      <Route path="/jobs/:id/form" element={<p>Form builder page</p>} />
    </Routes>,
    { route: "/jobs" },
  );
}

describe("JobListPage", () => {
  it("opens a job's application form from its title and shows the form state", async () => {
    mockJobList();

    renderList();

    const link = await screen.findByRole("link", { name: "Data Scientist" });
    expect(link).toHaveAttribute("href", "/jobs/5/form");
    const row = link.closest("tr") as HTMLTableRowElement;
    expect(within(row).getByText("Contract · Data · Jakarta")).toBeInTheDocument();
    expect(await within(row).findByText("Live")).toBeInTheDocument();
    expect(within(row).getByText("12 applications")).toBeInTheDocument();
    // Requirements live in Edit now, not in the table.
    expect(within(row).queryByText("Python")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Form" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /required skills/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new job/i })).toHaveAttribute("href", "/jobs/new");
    // The old "Jobs | Application forms" tabs are gone.
    expect(screen.queryByRole("navigation", { name: "Section" })).not.toBeInTheDocument();
  });

  it("labels the form button 'Form' or 'Create form' and links applicants to the candidates filter", async () => {
    mockJobList();

    renderList();

    const formLink = await screen.findByRole("link", { name: "Form for Data Scientist" });
    expect(formLink).toHaveAttribute("href", "/jobs/5/form");
    expect(formLink).toHaveTextContent("Form");
    const create = await screen.findByRole("button", { name: "Create form for QA Engineer" });
    expect(create).toHaveTextContent("Create form");
    expect(screen.getByText("No form")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "3 applicants for Data Scientist" })).toHaveAttribute(
      "href",
      "/candidates?job_id=5",
    );
  });

  it("opens the form builder when a row is clicked", async () => {
    mockJobList();
    const user = userEvent.setup();

    renderList();

    const link = await screen.findByRole("link", { name: "QA Engineer" });
    await user.click(within(link.closest("tr") as HTMLTableRowElement).getByText("Contract · Data · Jakarta"));
    expect(await screen.findByText("Form builder page")).toBeInTheDocument();
  });

  it("offers every job action in the row menu", async () => {
    mockJobList();
    const user = userEvent.setup();

    renderList();

    await user.click(await screen.findByRole("button", { name: "More actions for Data Scientist" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Applicants" })).toHaveAttribute("href", "/candidates?job_id=5");
    expect(within(menu).getByRole("menuitem", { name: "Edit job" })).toHaveAttribute("href", "/jobs/5/edit");
    expect(within(menu).getByRole("menuitem", { name: "Interview templates" })).toHaveAttribute(
      "href",
      "/interviews/templates?job_id=5",
    );
    expect(within(menu).getByRole("menuitem", { name: "Add candidates manually" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "Delete job" })).toBeInTheDocument();

    await user.click(within(menu).getByRole("menuitem", { name: "Close job" }));
    expect(await screen.findByRole("dialog", { name: "Close this job?" })).toBeInTheDocument();
  });

  it("distinguishes 'no jobs yet' from 'no match for filters'", async () => {
    mockFetch((url) => (url.includes("/forms") ? jsonResponse([]) : jsonResponse({ items: [], total: 0, page: 1, page_size: 20 })));
    const user = userEvent.setup();

    renderWithProviders(<JobListPage />, { route: "/jobs?status=closed" });
    expect(await screen.findByText("No jobs match your filters")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0] as HTMLElement);
    expect(await screen.findByText("No jobs yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create your first job/i })).toBeInTheDocument();
  });
});

describe("Job pages", () => {
  it("redirects the old job detail URL to the job's application form", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/jobs/:id" element={<JobDetailRedirect />} />
        <Route path="/jobs/:id/form" element={<p>Form builder page</p>} />
      </Routes>,
      { route: "/jobs/5" },
    );

    expect(await screen.findByText("Form builder page")).toBeInTheDocument();
  });

  it("creating a job shows a success notification and returns to the job list", async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith("/jobs") && init?.method === "POST") return jsonResponse({ ...job, id: 9, title: "QA Engineer" }, 201);
      if (url.includes("/jobs")) return jsonResponse({ items: [], total: 0, page: 1, page_size: 20 });
      return notFound();
    });
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/jobs/new" element={<JobFormPage />} />
        <Route path="/jobs" element={<p>Job list page</p>} />
      </Routes>,
      { route: "/jobs/new" },
    );

    await user.type(screen.getByLabelText(/^job title/i), "QA Engineer");
    await user.type(screen.getByLabelText(/^job description/i), "Test automation for our web products.");
    await user.type(screen.getByLabelText(/^required skills/i), "Selenium{Enter}");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    expect(await screen.findByText("Job list page")).toBeInTheDocument();
    expect(screen.getByText("Job created successfully")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true);
  });

  it("returns to the application form after editing a job opened from it", async () => {
    mockFetch((url, init) => {
      if (url.endsWith("/jobs/5") && init?.method === "PATCH") return jsonResponse(job);
      if (url.endsWith("/jobs/5")) return jsonResponse(job);
      return notFound();
    });
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/jobs/:id/edit" element={<JobFormPage />} />
        <Route path="/jobs/:id/form" element={<p>Form builder page</p>} />
      </Routes>,
      { route: "/jobs/5/edit?from=form" },
    );

    expect(await screen.findByRole("link", { name: "Application form" })).toHaveAttribute("href", "/jobs/5/form");
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(await screen.findByText("Form builder page")).toBeInTheDocument();
  });
});
