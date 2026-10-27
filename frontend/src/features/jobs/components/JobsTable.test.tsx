import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/utils";
import type { AutoInvite, Job } from "@/types/api";
import { JobsTable } from "./JobsTable";

const autoInvite: AutoInvite = {
  enabled: true,
  top_n: 10,
  min_score: null,
  send_at: "2026-10-31T08:00:00+07:00",
  timing: "next_morning",
  status: "scheduled",
  template_id: 3,
  template_name: "Data Scientist interview",
  ran_at: null,
  invited_count: null,
  skipped: null,
  error: null,
};

const baseJob: Job = {
  id: 5,
  title: "Data Scientist",
  department: "Data",
  location: "Jakarta",
  description: "Build models.",
  required_skills: ["Python"],
  preferred_skills: [],
  min_experience_years: null,
  education_level: null,
  education_field: null,
  required_certifications: [],
  status: "open",
  employment_type: "full_time",
  salary_min: null,
  salary_max: null,
  salary_visible: false,
  opens_on: "2026-10-26",
  closes_on: "2026-10-30",
  application_window: "open",
  days_left: 4,
  opens_time: null,
  closes_time: null,
  opens_at: null,
  closes_at: null,
  weights: { required_skills: 40, preferred_skills: 10, experience: 20, education: 10, certifications: 5, semantic: 15, screening_questions: 0 },
  auto_invite: autoInvite,
  is_demo: false,
  candidate_count: 12,
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-02T08:00:00Z",
};

function periodCell(overrides: Partial<AutoInvite>, jobOverrides: Partial<Job> = {}): HTMLElement {
  const job: Job = { ...baseJob, ...jobOverrides, auto_invite: { ...autoInvite, ...overrides } };
  renderWithProviders(<JobsTable jobs={[job]} formsByJob={new Map()} />);
  const row = screen.getByRole("link", { name: "Data Scientist" }).closest("tr") as HTMLTableRowElement;
  // Columns: Job, Status, Application period, …
  return within(row).getAllByRole("cell")[2] as HTMLElement;
}

describe("JobsTable auto-invite line", () => {
  it("shows the scheduled send time", () => {
    expect(periodCell({})).toHaveTextContent("AI interview invites: 31 Oct, 08:00");
  });

  it("shows the deadline date only when the job closes at the end of the day", () => {
    const cell = periodCell({});
    expect(cell).toHaveTextContent("Until 30 Oct 2026");
    expect(cell).not.toHaveTextContent("Until 30 Oct 2026,");
  });

  it("shows the closing time and an on-close invite time", () => {
    const cell = periodCell(
      { timing: "on_close", send_at: "2026-10-27T14:00:00+07:00" },
      { closes_on: "2026-10-27", closes_time: "14:00", closes_at: "2026-10-27T14:00:00+07:00", days_left: 0 },
    );
    expect(cell).toHaveTextContent("Until 27 Oct 2026, 14:00");
    expect(cell).toHaveTextContent("Closes today");
    expect(cell).toHaveTextContent("AI interview invites: 27 Oct, 14:00");
  });

  it("shows how many were invited once sent", () => {
    expect(periodCell({ status: "sent", ran_at: "2026-10-31T08:00:05+07:00", invited_count: 8 })).toHaveTextContent(
      "Invites sent · 8",
    );
  });

  it("links to the job's interview templates while waiting for an approved one", () => {
    const cell = periodCell({ status: "waiting_template", template_id: null, template_name: null });
    expect(within(cell).getByRole("link", { name: "Approve an interview template" })).toHaveAttribute(
      "href",
      "/interviews/templates?job_id=5",
    );
  });

  it("explains a missing closing date", () => {
    const cell = periodCell({ status: "no_deadline", send_at: null }, { closes_on: null, application_window: null, days_left: null });
    expect(cell).toHaveTextContent("No deadline");
    expect(cell).toHaveTextContent("Auto-invite needs a closing date");
  });

  it("flags a failed run", () => {
    expect(periodCell({ status: "failed", error: "SMTP unavailable" })).toHaveTextContent("Auto-invite failed — retrying");
  });

  it("shows nothing when automatic invitations are off", () => {
    const cell = periodCell({ enabled: false, status: "disabled" });
    expect(cell).toHaveTextContent("Until 30 Oct 2026");
    expect(cell).not.toHaveTextContent(/invite/i);
  });
});
