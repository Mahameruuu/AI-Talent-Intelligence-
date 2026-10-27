import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { Job } from "@/types/api";
import { DeleteJobDialog } from "./DeleteJobDialog";

const baseJob: Job = {
  id: 7,
  title: "Backend Engineer",
  department: null,
  location: null,
  description: "Build services.",
  required_skills: [],
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
  weights: { required_skills: 40, preferred_skills: 15, experience: 20, education: 10, certifications: 5, semantic: 10, screening_questions: 0 },
  is_demo: false,
  candidate_count: 0,
  opens_on: null,
  closes_on: null,
  application_window: null,
  days_left: null,
  auto_invite: {
    enabled: false,
    top_n: 10,
    min_score: null,
    send_at: null,
    status: "disabled",
    template_id: null,
    template_name: null,
    ran_at: null,
    invited_count: null,
    skipped: null,
    error: null,
  },
  created_at: "2026-10-01T08:00:00Z",
  updated_at: "2026-10-01T08:00:00Z",
};

describe("DeleteJobDialog", () => {
  it("deletes a job without applications after confirmation", async () => {
    const fetchMock = mockFetch(() => new Response(null, { status: 204 }));
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteJobDialog job={baseJob} open onClose={vi.fn()} onDeleted={onDeleted} />);

    await userEvent.click(screen.getByRole("button", { name: "Delete job" }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/jobs\/7$/);
    expect(init.method).toBe("DELETE");
    expect(onDeleted).toHaveBeenCalled();
  });

  it("offers closing a job that has applications instead of deleting it", async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ...baseJob, candidate_count: 3, status: "closed" }));
    renderWithProviders(<DeleteJobDialog job={{ ...baseJob, candidate_count: 3 }} open onClose={vi.fn()} />);

    expect(screen.getByText("Delete this job?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete job and applications" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Close job instead" }));

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ status: "closed" });
  });

  it("force-deletes a job with applications only after typing the job title", async () => {
    const fetchMock = mockFetch(() => new Response(null, { status: 204 }));
    renderWithProviders(<DeleteJobDialog job={{ ...baseJob, candidate_count: 2 }} open onClose={vi.fn()} />);

    const confirm = screen.getByRole("button", { name: "Delete job and applications" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/type the job title/i), "Backend Engineer");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/jobs/7?force=true");
    expect(init.method).toBe("DELETE");
  });
});
