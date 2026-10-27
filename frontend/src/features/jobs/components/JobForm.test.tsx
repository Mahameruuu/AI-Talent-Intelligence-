import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { Job, JobInput } from "@/types/api";
import { addDays, isoLocalDate } from "./job-form-schema";
import { JobForm, type JobFormProps } from "./JobForm";

function setup(props: Partial<Omit<JobFormProps, "onSubmit">> = {}) {
  const onSubmit = vi.fn<(input: JobInput) => Promise<void>>().mockResolvedValue(undefined);
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <JobForm mode="create" onSubmit={onSubmit} {...props} />
    </MemoryRouter>,
  );
  return { user, onSubmit };
}

const existingJob: Job = {
  id: 7,
  title: "Data Scientist",
  department: "Data",
  location: null,
  description: "Build models.",
  required_skills: ["Python"],
  preferred_skills: ["Docker"],
  min_experience_years: 3,
  education_level: "bachelor",
  education_field: null,
  required_certifications: [],
  status: "open",
  employment_type: "full_time",
  salary_min: null,
  salary_max: null,
  salary_visible: false,
  weights: { required_skills: 50, preferred_skills: 10, experience: 20, education: 10, certifications: 0, semantic: 10, screening_questions: 0 },
  is_demo: false,
  candidate_count: 4,
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

describe("JobForm", () => {
  it("shows validation errors and does not submit an empty form", async () => {
    const { user, onSubmit } = setup();

    await user.click(screen.getByRole("button", { name: "Create job" }));

    expect(await screen.findByText("Enter a job title.")).toBeInTheDocument();
    expect(screen.getByText("Add a job description.")).toBeInTheDocument();
    expect(screen.getByText("Add at least one required skill.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("requires a job description of at least 10 characters, like the backend", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "QA Engineer");
    await user.type(screen.getByLabelText(/^job description/i), "Testing");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    expect(await screen.findByText("Use at least 10 characters for the job description.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the JobInput payload with nulls for empty optionals and no weights in create mode", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "Data Scientist");
    await user.type(screen.getByLabelText(/^job description/i), "Build and ship ML models.");
    await user.type(screen.getByLabelText(/^required skills/i), "Python{Enter}");
    expect(screen.getByRole("button", { name: "Remove Python" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const payload = onSubmit.mock.calls[0]?.[0];
    expect(payload).toEqual({
      title: "Data Scientist",
      department: null,
      location: null,
      description: "Build and ship ML models.",
      required_skills: ["Python"],
      preferred_skills: [],
      required_certifications: [],
      min_experience_years: null,
      education_level: null,
      education_field: null,
      status: "open",
      employment_type: "full_time",
      salary_min: null,
      salary_max: null,
      salary_visible: false,
      // Default application period: today until today + 30 days.
      opens_on: isoLocalDate(new Date()),
      closes_on: isoLocalDate(addDays(new Date(), 30)),
      // Times are optional: null = 00:00 (open) / end of the day (close).
      opens_time: null,
      closes_time: null,
      // Automatic AI-interview invitations are on by default for new jobs, the next morning.
      auto_invite: { enabled: true, top_n: 10, min_score: null, timing: "next_morning" },
    });
    expect(payload).not.toHaveProperty("weights");
  });

  it("shows when invitations are emailed (from the deadline) and sends the auto-invite settings", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "Data Scientist");
    await user.type(screen.getByLabelText(/^job description/i), "Build and ship ML models.");
    await user.type(screen.getByLabelText(/^required skills/i), "Python{Enter}");
    const opens = screen.getByLabelText(/^applications open on/i);
    const closes = screen.getByLabelText(/^application deadline/i);
    await user.clear(opens);
    await user.type(opens, "2026-10-26");
    await user.clear(closes);
    await user.type(closes, "2026-10-30");

    expect(screen.getByRole("switch", { name: "Send AI interview invitations automatically" })).toBeChecked();
    expect(screen.getByText("Sat, 31 Oct 2026 at 08:00 WIB")).toBeInTheDocument();
    expect(screen.getByText(/the day after applications close/)).toBeInTheDocument();
    expect(screen.getByText(/don't meet a must-have question are not invited automatically/)).toBeInTheDocument();

    const topN = screen.getByLabelText(/^invite the top/i);
    await user.clear(topN);
    await user.type(topN, "5");
    await user.type(screen.getByLabelText(/^minimum match score/i), "60");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      closes_on: "2026-10-30",
      auto_invite: { enabled: true, top_n: 5, min_score: 60 },
    });
  });

  it("sends opening/closing times and invites right after applications close", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "Data Scientist");
    await user.type(screen.getByLabelText(/^job description/i), "Build and ship ML models.");
    await user.type(screen.getByLabelText(/^required skills/i), "Python{Enter}");
    const opens = screen.getByLabelText(/^applications open on/i);
    const closes = screen.getByLabelText(/^application deadline/i);
    await user.clear(opens);
    await user.type(opens, "2026-10-27");
    await user.clear(closes);
    await user.type(closes, "2026-10-27");
    await user.type(screen.getByLabelText("Opening time (WIB)"), "09:00");
    await user.type(screen.getByLabelText("Closing time (WIB)"), "14:00");

    // Next morning is the default; the sentence follows the deadline day.
    expect(screen.getByRole("radio", { name: /Next morning at 08:00 WIB/ })).toBeChecked();
    expect(screen.getByText("Wed, 28 Oct 2026 at 08:00 WIB")).toBeInTheDocument();
    expect(screen.getByText(/applications accepted until 14:00 WIB on 27 Oct 2026/)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /Right after applications close/ }));
    expect(screen.getByText("Tue, 27 Oct 2026 at 14:00 WIB")).toBeInTheDocument();
    expect(screen.getByText(/— right after applications close\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Create job" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      opens_on: "2026-10-27",
      opens_time: "09:00",
      closes_on: "2026-10-27",
      closes_time: "14:00",
      auto_invite: { enabled: true, top_n: 10, timing: "on_close" },
    });
  });

  it("requires the closing time to be after the opening time on the same day", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "QA Engineer");
    await user.type(screen.getByLabelText(/^job description/i), "Test automation for web products.");
    await user.type(screen.getByLabelText(/^required skills/i), "Selenium{Enter}");
    const opens = screen.getByLabelText(/^applications open on/i);
    const closes = screen.getByLabelText(/^application deadline/i);
    await user.clear(opens);
    await user.type(opens, "2026-12-01");
    await user.clear(closes);
    await user.type(closes, "2026-12-01");
    await user.type(screen.getByLabelText("Opening time (WIB)"), "15:00");
    await user.type(screen.getByLabelText("Closing time (WIB)"), "10:00");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    expect(await screen.findByText("Applications must close after they open.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("loads a job's times and invite timing when editing", () => {
    setup({
      mode: "edit",
      defaultValues: {
        ...existingJob,
        opens_on: "2026-10-26",
        closes_on: "2026-10-27",
        opens_time: "08:30",
        closes_time: "14:00",
        auto_invite: { ...existingJob.auto_invite, enabled: true, status: "scheduled", timing: "on_close" },
      },
    });

    expect(screen.getByLabelText("Opening time (WIB)")).toHaveValue("08:30");
    expect(screen.getByLabelText("Closing time (WIB)")).toHaveValue("14:00");
    expect(screen.getByRole("radio", { name: /Right after applications close/ })).toBeChecked();
    expect(screen.getByText("Tue, 27 Oct 2026 at 14:00 WIB")).toBeInTheDocument();
  });

  it("asks for a closing date and validates the number of applicants", async () => {
    const { user, onSubmit } = setup();

    await user.clear(screen.getByLabelText(/^application deadline/i));
    expect(screen.getByText("Set a closing date so invitations can be sent automatically.")).toBeInTheDocument();

    const topN = screen.getByLabelText(/^invite the top/i);
    await user.clear(topN);
    await user.type(topN, "101");
    await user.click(screen.getByRole("button", { name: "Create job" }));
    expect(await screen.findByText("Use 100 or fewer.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("can turn automatic invitations off", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "Data Scientist");
    await user.type(screen.getByLabelText(/^job description/i), "Build and ship ML models.");
    await user.type(screen.getByLabelText(/^required skills/i), "Python{Enter}");
    await user.click(screen.getByRole("switch", { name: "Send AI interview invitations automatically" }));
    expect(screen.queryByLabelText(/^invite the top/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ auto_invite: { enabled: false, top_n: 10, min_score: null } });
  });

  it("shows when invitations were sent for a job that already ran", () => {
    setup({
      mode: "edit",
      defaultValues: {
        ...existingJob,
        closes_on: "2026-10-30",
        auto_invite: {
          ...existingJob.auto_invite,
          enabled: true,
          status: "sent",
          send_at: "2026-10-31T08:00:00+07:00",
          timing: "next_morning",
          ran_at: "2026-10-31T08:00:05+07:00",
          invited_count: 8,
        },
      },
    });

    expect(screen.getByText("Invitations sent on 31 Oct 2026 (8 applicants).")).toBeInTheDocument();
    expect(screen.queryByText(/the day after applications close/)).not.toBeInTheDocument();
  });

  it("requires a deadline that is not before the opening date", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "QA Engineer");
    await user.type(screen.getByLabelText(/^job description/i), "Test automation for web products.");
    await user.type(screen.getByLabelText(/^required skills/i), "Selenium{Enter}");
    const opens = screen.getByLabelText(/^applications open on/i);
    const closes = screen.getByLabelText(/^application deadline/i);
    await user.clear(opens);
    await user.type(opens, "2026-12-10");
    await user.clear(closes);
    await user.type(closes, "2026-12-01");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    expect(await screen.findByText("The deadline can't be before the opening date.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(closes);
    await user.type(closes, "2026-12-31");
    expect(await screen.findByText(/Open for 22 days/)).toBeInTheDocument();
  });

  it("rejects a skill that is both required and preferred (case-insensitive)", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "Data Engineer");
    await user.type(screen.getByLabelText(/^job description/i), "Pipelines.");
    await user.type(screen.getByLabelText(/^required skills/i), "SQL{Enter}");
    await user.type(screen.getByLabelText(/^preferred skills/i), "sql{Enter}");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    expect(await screen.findByText(/“sql” is already required/)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("parses the experience input as a number, shows the checklist and never sends weights", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "ML Engineer");
    await user.type(screen.getByLabelText(/^job description/i), "Deploy models.");
    await user.type(screen.getByLabelText(/^required skills/i), "PyTorch{Enter}");
    await user.type(screen.getByLabelText(/^minimum experience/i), "2.5");
    expect(screen.getByText("Ready to create.")).toBeInTheDocument();
    expect(screen.queryByText(/settings → scoring weights/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ min_experience_years: 2.5 });
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("weights");
  });

  it("uses standard radio buttons for the status (no Closed option when creating)", async () => {
    const { user, onSubmit } = setup();

    const open = screen.getByRole("radio", { name: /^open/i });
    const draft = screen.getByRole("radio", { name: /^draft/i });
    expect(open).toBeChecked();
    expect(screen.queryByRole("radio", { name: /^closed/i })).not.toBeInTheDocument();
    await user.click(draft);
    expect(draft).toBeChecked();

    await user.type(screen.getByLabelText(/^job title/i), "QA Engineer");
    await user.type(screen.getByLabelText(/^job description/i), "Test automation for web products.");
    await user.type(screen.getByLabelText(/^required skills/i), "Selenium{Enter}");
    await user.click(screen.getByRole("button", { name: "Create job" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ status: "draft" });
  });

  it("sends the job's fields without weights in edit mode", async () => {
    const { user, onSubmit } = setup({ mode: "edit", defaultValues: existingJob });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      title: "Data Scientist",
      department: "Data",
      location: null,
      min_experience_years: 3,
      education_level: "bachelor",
      auto_invite: { enabled: false, top_n: 10, min_score: null },
    });
    expect(onSubmit.mock.calls[0]?.[0]).not.toHaveProperty("weights");
  });

  it("sends the employment type and salary range as numbers", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "Data Analyst");
    await user.type(screen.getByLabelText(/^job description/i), "Dashboards and reporting.");
    await user.type(screen.getByLabelText(/^required skills/i), "SQL{Enter}");
    await user.selectOptions(screen.getByLabelText(/^employment type/i), "contract");
    const min = screen.getByLabelText(/^minimum$/i);
    await user.type(min, "12000000");
    await user.tab();
    expect(min).toHaveValue("12.000.000");
    await user.type(screen.getByLabelText(/^maximum$/i), "18.000.000");
    await user.click(screen.getByRole("checkbox", { name: /show salary range to applicants/i }));
    await user.click(screen.getByRole("button", { name: "Create job" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      employment_type: "contract",
      salary_min: 12000000,
      salary_max: 18000000,
      salary_visible: true,
    });
  });

  it("rejects a maximum salary lower than the minimum", async () => {
    const { user, onSubmit } = setup();

    await user.type(screen.getByLabelText(/^job title/i), "Data Analyst");
    await user.type(screen.getByLabelText(/^job description/i), "Dashboards and reporting.");
    await user.type(screen.getByLabelText(/^required skills/i), "SQL{Enter}");
    await user.type(screen.getByLabelText(/^minimum$/i), "15000000");
    await user.type(screen.getByLabelText(/^maximum$/i), "9000000");
    await user.click(screen.getByRole("button", { name: "Create job" }));

    expect(await screen.findByText("The maximum can't be lower than the minimum.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^maximum$/i)).toHaveAttribute("aria-invalid", "true");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("pre-fills the employment type and salary when editing", async () => {
    const { user, onSubmit } = setup({
      mode: "edit",
      defaultValues: { ...existingJob, employment_type: "internship", salary_min: 4000000, salary_max: null, salary_visible: true },
    });

    expect(screen.getByLabelText(/^employment type/i)).toHaveValue("internship");
    expect(screen.getByLabelText(/^minimum$/i)).toHaveValue("4.000.000");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      employment_type: "internship",
      salary_min: 4000000,
      salary_max: null,
      salary_visible: true,
    });
  });
});
