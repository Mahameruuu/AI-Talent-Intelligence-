import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { ApplicationForm, ApplicationFormInput, Job } from "@/types/api";
import { FormBuilderPage } from "./FormBuilderPage";

const job: Job = {
  id: 5,
  title: "Data Scientist",
  department: "Data",
  location: "Jakarta",
  description: "Build models.",
  required_skills: ["Python"],
  preferred_skills: [],
  min_experience_years: 2,
  education_level: null,
  education_field: null,
  required_certifications: [],
  status: "open",
  employment_type: "full_time",
  salary_min: null,
  salary_max: null,
  salary_visible: false,
  weights: {
    required_skills: 40,
    preferred_skills: 10,
    experience: 20,
    education: 10,
    certifications: 5,
    semantic: 15,
    screening_questions: 0,
  },
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
  updated_at: "2026-10-02T08:00:00Z",
};

const form: ApplicationForm = {
  id: 9,
  job_id: 5,
  job_title: "Data Scientist",
  slug: "k3J9xQ2mP0aB",
  public_url: "http://localhost:5173/apply/k3J9xQ2mP0aB",
  title: "Apply: Data Scientist",
  intro: null,
  built_in_fields: [
    { id: "full_name", label: "Full name", type: "short_text", required: true, built_in: true },
    { id: "email", label: "Email", type: "email", required: true, built_in: true },
    { id: "phone", label: "Phone number", type: "phone", required: true, built_in: true },
    { id: "cv", label: "CV (PDF or DOCX, max 10 MB)", type: "file", required: true, built_in: true },
  ],
  fields: [
    {
      id: "f_domicile",
      label: "Current city of residence",
      type: "short_text",
      required: true,
      help_text: null,
      placeholder: "e.g. Jakarta",
      options: [],
      max_length: null,
    },
  ],
  status: "published",
  accepting_applications: true,
  closed_reason: null,
  job_opens_on: null,
  job_closes_on: null,
  closes_at: null,
  published_at: "2026-10-10T08:00:00Z",
  submission_count: 12,
  created_at: "2026-10-09T08:00:00Z",
  updated_at: "2026-10-10T08:00:00Z",
};

function mockApi(onPut?: (body: ApplicationFormInput) => ApplicationForm, current: ApplicationForm = form) {
  return mockFetch((url, init) => {
    const method = init?.method ?? "GET";
    if (url.endsWith("/jobs/5/form/publish") && method === "POST") {
      return jsonResponse({ ...current, status: "published", accepting_applications: true });
    }
    if (url.endsWith("/jobs/5/form") && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as ApplicationFormInput;
      return jsonResponse(onPut ? onPut(body) : form);
    }
    if (url.endsWith("/jobs/5/form")) return jsonResponse(current);
    if (url.endsWith("/jobs/5")) return jsonResponse(job);
    return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
  });
}

function renderBuilder() {
  return renderWithProviders(
    <Routes>
      <Route path="/jobs/:id/form" element={<FormBuilderPage />} />
    </Routes>,
    { route: "/jobs/5/form" },
  );
}

function putCalls(fetchMock: ReturnType<typeof mockApi>) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
}


/** Adds a blank question (it becomes the active card) with the given label and type; returns its card. */
async function addQuestion(user: ReturnType<typeof userEvent.setup>, label: string, type: string) {
  await user.click(await screen.findByRole("button", { name: /^add question$/i }));
  const cards = screen.getAllByTestId(/^custom-field-/);
  const card = cards[cards.length - 1] as HTMLElement;
  await user.type(within(card).getByRole("textbox", { name: "Question" }), label);
  await user.selectOptions(within(card).getByRole("combobox", { name: "Answer type" }), type);
  return card;
}

function lastPutBody(fetchMock: ReturnType<typeof mockApi>): ApplicationFormInput {
  const calls = putCalls(fetchMock);
  return JSON.parse(String(calls[calls.length - 1]?.[1]?.body)) as ApplicationFormInput;
}

async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getAllByRole("button", { name: /^save/i })[0] as HTMLElement);
}

/** The click target that activates an inactive question card. */
function editButton(card: HTMLElement): HTMLElement {
  return within(card).getByRole("button", { name: /^edit question/i });
}

const relocate: ApplicationForm["fields"][number] = {
  id: "f_relocate",
  label: "Willing to relocate?",
  type: "yes_no",
  required: false,
  help_text: "We have offices in Jakarta and Surabaya.",
  placeholder: null,
  options: [],
  max_length: null,
  screening: { enabled: true, knockout: true, expected: "yes" },
};

describe("FormBuilderPage", () => {
  it("shows the header, the live link bar and the applicant details card", async () => {
    mockApi();

    renderBuilder();

    expect(await screen.findByRole("heading", { level: 1, name: "Application form" })).toBeInTheDocument();
    expect(screen.getByText("Data Scientist · Full-time")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jobs" })).toHaveAttribute("href", "/jobs");
    expect(screen.getByDisplayValue(form.public_url)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "12 applications" })).toHaveAttribute("href", "/candidates?job_id=5");
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
    // Title card: inline title + description.
    expect(screen.getByRole("textbox", { name: "Form title" })).toHaveValue("Apply: Data Scientist");
    expect(screen.getByRole("textbox", { name: "Form description" })).toHaveAttribute(
      "placeholder",
      "Form description (optional)",
    );

    const details = screen.getByTestId("built-in-fields");
    expect(within(details).getByText("Always included")).toBeInTheDocument();
    for (const id of ["full_name", "email", "phone"]) {
      expect(within(screen.getByTestId(`built-in-${id}`)).getByRole("textbox")).toBeDisabled();
    }
    expect(within(screen.getByTestId("built-in-cv")).getByText("Upload PDF or DOCX")).toBeInTheDocument();
  });

  it("renders inactive questions as the applicant sees them", async () => {
    mockApi(undefined, { ...form, fields: [...form.fields, relocate] });

    renderBuilder();

    const first = await screen.findByTestId("custom-field-0");
    const second = screen.getByTestId("custom-field-1");
    expect(within(first).getByText("Current city of residence")).toBeInTheDocument();
    expect(within(first).getByRole("textbox", { name: "Answer" })).toBeDisabled();
    expect(within(first).getByRole("textbox", { name: "Answer" })).toHaveAttribute("placeholder", "e.g. Jakarta");
    expect(within(second).getByText("We have offices in Jakarta and Surabaya.")).toBeInTheDocument();
    expect(within(second).getByRole("radio", { name: "Yes" })).toBeDisabled();
    expect(within(second).getByRole("radio", { name: "No" })).toBeDisabled();
    expect(within(second).getByText("Screening")).toBeInTheDocument();
    expect(within(second).getByText("Must-have")).toBeInTheDocument();
    // No editors until a card is clicked.
    expect(screen.queryByRole("textbox", { name: "Question" })).not.toBeInTheDocument();
  });

  it("activates a card on click and deactivates the previous one", async () => {
    mockApi(undefined, { ...form, fields: [...form.fields, relocate] });
    const user = userEvent.setup();

    renderBuilder();

    const first = await screen.findByTestId("custom-field-0");
    await user.click(editButton(first));
    expect(within(first).getByRole("textbox", { name: "Question" })).toHaveValue("Current city of residence");

    const second = screen.getByTestId("custom-field-1");
    await user.click(editButton(second));
    expect(within(second).getByRole("textbox", { name: "Question" })).toHaveValue("Willing to relocate?");
    expect(within(first).queryByRole("textbox", { name: "Question" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: "Question" })).toHaveLength(1);
    // The saved rule is shown with the expected answer marked.
    expect(within(second).getByRole("switch", { name: "Screening" })).toHaveAttribute("aria-checked", "true");
    expect(within(second).getByRole("button", { name: "Accept “Yes”" })).toHaveAttribute("aria-pressed", "true");
  });

  it("toggles Required with a switch", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    renderBuilder();

    const card = await screen.findByTestId("custom-field-0");
    await user.click(editButton(card));
    const required = within(card).getByRole("switch", { name: "Required" });
    expect(required).toHaveAttribute("aria-checked", "true");
    await user.click(required);
    expect(required).toHaveAttribute("aria-checked", "false");

    await save(user);
    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1));
    expect((lastPutBody(fetchMock).fields ?? [])[0]?.required).toBe(false);
  });

  it("duplicates a question right after the original", async () => {
    const fetchMock = mockApi(undefined, { ...form, fields: [...form.fields, relocate] });
    const user = userEvent.setup();

    renderBuilder();

    await user.click(editButton(await screen.findByTestId("custom-field-0")));
    await user.click(screen.getByRole("button", { name: /duplicate “current city of residence”/i }));

    const copy = screen.getByTestId("custom-field-1");
    expect(within(copy).getByRole("textbox", { name: "Question" })).toHaveValue("Current city of residence");
    expect(within(screen.getByTestId("custom-field-2")).getByText("Willing to relocate?")).toBeInTheDocument();

    await save(user);
    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1));
    const fields = lastPutBody(fetchMock).fields ?? [];
    expect(fields.map((field) => field.label)).toEqual([
      "Current city of residence",
      "Current city of residence",
      "Willing to relocate?",
    ]);
    expect(fields[0]?.id).toBe("f_domicile");
    expect(fields[1]?.id).toBeUndefined();
  });

  it("keeps help text and placeholder behind More options", async () => {
    mockApi(undefined, { ...form, fields: [{ ...(form.fields[0] as ApplicationForm["fields"][number]), placeholder: null }] });
    const user = userEvent.setup();

    renderBuilder();

    await user.click(editButton(await screen.findByTestId("custom-field-0")));
    expect(screen.queryByLabelText(/help text/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/placeholder/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /more options/i }));
    expect(screen.getByLabelText(/help text/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/placeholder/i)).toBeInTheDocument();
  });

  it("opens the preview in a dialog", async () => {
    mockApi();
    const user = userEvent.setup();

    renderBuilder();

    await user.click(await screen.findByRole("button", { name: /preview/i }));
    const dialog = screen.getByRole("dialog", { name: "Preview" });
    const preview = within(dialog).getByRole("region", { name: "Form preview" });
    expect(within(preview).getByText("Apply: Data Scientist")).toBeInTheDocument();
    expect(within(preview).getByText("Current city of residence")).toBeInTheDocument();
  });

  it("publishes a draft and then shows the link bar", async () => {
    const draft: ApplicationForm = { ...form, status: "draft", accepting_applications: false, published_at: null };
    const fetchMock = mockApi(undefined, draft);
    const user = userEvent.setup();

    renderBuilder();

    expect(await screen.findByText("Publish the form to get a shareable link.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(form.public_url)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^publish$/i }));

    expect(await screen.findByDisplayValue(form.public_url)).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/jobs/5/form/publish"))).toBe(true);
  });

  it("requires at least two options for a dropdown question", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    renderBuilder();

    const card = await addQuestion(user, "Preferred work mode", "select");
    await user.type(within(card).getByLabelText("Option 1"), "Remote");

    await save(user);

    expect(await screen.findByText("Add at least two different options.")).toBeInTheDocument();
    expect(putCalls(fetchMock)).toHaveLength(0);

    await user.type(screen.getByLabelText("Option 2"), "Hybrid");
    await waitFor(() => expect(screen.queryByText("Add at least two different options.")).not.toBeInTheDocument());
  });

  it("activates and focuses the first invalid question on save", async () => {
    mockApi();
    const user = userEvent.setup();

    renderBuilder();

    const card = await addQuestion(user, "Portfolio link", "url");
    await user.clear(within(card).getByRole("textbox", { name: "Question" }));
    // Activate another card so the invalid one is inactive.
    await user.click(editButton(screen.getByTestId("custom-field-0")));
    expect(within(card).queryByRole("textbox", { name: "Question" })).not.toBeInTheDocument();

    await save(user);

    const question = await within(card).findByRole("textbox", { name: "Question" });
    expect(question).toHaveAttribute("aria-invalid", "true");
    await waitFor(() => expect(question).toHaveFocus());
    expect(within(card).getByText("Give this question a label")).toBeInTheDocument();
    expect(within(screen.getByTestId("custom-field-0")).queryByRole("textbox", { name: "Question" })).not.toBeInTheDocument();
  });

  it("saves the title and questions with the right PUT payload", async () => {
    const fetchMock = mockApi((body) => ({
      ...form,
      title: body.title ?? form.title,
      fields: (body.fields ?? []).map((field, index) => ({ ...field, id: field.id ?? `f_new${index}` })),
    }));
    const user = userEvent.setup();

    renderBuilder();

    const title = await screen.findByRole("textbox", { name: "Form title" });
    await user.clear(title);
    await user.type(title, "Join our data team");

    const card = await addQuestion(user, "Which tools do you use?", "multi_select");
    await user.type(within(card).getByLabelText("Option 1"), "Python");
    await user.type(within(card).getByLabelText("Option 2"), "SQL");
    await user.click(within(card).getByRole("switch", { name: "Required" }));
    // Move the new question to the top.
    await user.click(screen.getByRole("button", { name: /move “which tools do you use\?” up/i }));

    await save(user);

    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1));
    const [url, init] = putCalls(fetchMock)[0] ?? [];
    expect(String(url)).toMatch(/\/jobs\/5\/form$/);
    expect(JSON.parse(String(init?.body))).toEqual({
      title: "Join our data team",
      intro: null,
      closes_at: null,
      fields: [
        {
          label: "Which tools do you use?",
          type: "multi_select",
          required: true,
          help_text: null,
          placeholder: null,
          options: ["Python", "SQL"],
          max_length: null,
          screening: null,
        },
        {
          id: "f_domicile",
          label: "Current city of residence",
          type: "short_text",
          required: true,
          help_text: null,
          placeholder: "e.g. Jakarta",
          options: [],
          max_length: null,
          screening: null,
        },
      ],
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled());
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
  });

  it("marks the expected Yes/No answer and sends the rule", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    renderBuilder();

    // Text questions can't be scored.
    await user.click(editButton(await screen.findByTestId("custom-field-0")));
    expect(screen.queryByRole("switch", { name: "Screening" })).not.toBeInTheDocument();

    const card = await addQuestion(user, "Do you need visa sponsorship?", "yes_no");
    expect(within(card).queryByRole("group", { name: "Expected answer" })).not.toBeInTheDocument();
    await user.click(within(card).getByRole("switch", { name: "Screening" }));
    expect(within(card).getByRole("group", { name: "Expected answer" })).toBeInTheDocument();

    // The expected answer is required once the rule is on.
    await save(user);
    expect(await within(card).findByText("Choose the expected answer.")).toBeInTheDocument();
    expect(putCalls(fetchMock)).toHaveLength(0);

    await user.click(within(card).getByRole("button", { name: "Accept “No”" }));
    expect(within(card).getByRole("button", { name: "Accept “No”" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(card).getByRole("switch", { name: /must-have/i }));

    // The preview never reveals the expected answer.
    await user.click(screen.getByRole("button", { name: /preview/i }));
    const preview = screen.getByRole("region", { name: "Form preview" });
    expect(within(preview).getByText("Do you need visa sponsorship?")).toBeInTheDocument();
    expect(within(preview).queryByText(/screening|must-have|expected/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close dialog/i }));

    await save(user);

    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1));
    const fields = lastPutBody(fetchMock).fields ?? [];
    expect(fields[0]?.screening).toBeNull();
    expect(fields[1]).toMatchObject({ label: "Do you need visa sponsorship?", type: "yes_no" });
    expect(fields[1]?.screening).toEqual({ enabled: true, knockout: true, expected: "no" });
  });

  it("marks accepted dropdown options and sends only those that still exist", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    renderBuilder();

    const card = await addQuestion(user, "Highest education", "select");
    await user.type(within(card).getByLabelText("Option 1"), "SMA");
    await user.type(within(card).getByLabelText("Option 2"), "S1");
    await user.click(within(card).getByRole("button", { name: /add option/i }));
    await user.type(within(card).getByLabelText("Option 3"), "S2");
    await user.click(within(card).getByRole("switch", { name: "Screening" }));

    await save(user);
    expect(await within(card).findByText("Mark at least one accepted answer.")).toBeInTheDocument();
    expect(putCalls(fetchMock)).toHaveLength(0);

    await user.click(within(card).getByRole("button", { name: "Accept “S1”" }));
    await user.click(within(card).getByRole("button", { name: "Accept “S2”" }));
    // Renaming an accepted option keeps it accepted; removing one drops it.
    await user.type(within(card).getByLabelText("Option 2"), "/D4");
    expect(within(card).getByRole("button", { name: "Accept “S1/D4”" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(card).getByRole("button", { name: "Remove option 3" }));
    expect(within(card).queryByRole("button", { name: "Accept “S2”" })).not.toBeInTheDocument();

    await save(user);

    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1));
    const field = (lastPutBody(fetchMock).fields ?? [])[1];
    expect(field?.options).toEqual(["SMA", "S1/D4"]);
    expect(field?.screening).toEqual({ enabled: true, knockout: false, accepted: ["S1/D4"] });
  });

  it("validates number bounds before sending them", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    renderBuilder();

    const card = await addQuestion(user, "Years of SQL experience", "number");
    await user.click(within(card).getByRole("switch", { name: "Screening" }));
    await save(user);
    expect(await within(card).findByText("Enter a minimum, a maximum or both.")).toBeInTheDocument();

    const expected = within(card).getByRole("group", { name: "Expected answer" });
    await user.type(within(expected).getByLabelText("Minimum"), "5");
    await user.type(within(expected).getByLabelText("Maximum"), "2");
    await save(user);
    expect(await within(card).findByText("The maximum can't be lower than the minimum.")).toBeInTheDocument();
    expect(within(expected).getByLabelText("Maximum")).toHaveAttribute("aria-invalid", "true");
    expect(putCalls(fetchMock)).toHaveLength(0);

    await user.clear(within(expected).getByLabelText("Maximum"));
    await save(user);

    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1));
    expect((lastPutBody(fetchMock).fields ?? [])[1]?.screening).toEqual({ enabled: true, knockout: false, min: 5 });
  });

  it("clears the screening rule when the answer type changes", async () => {
    const fetchMock = mockApi();
    const user = userEvent.setup();

    renderBuilder();

    const card = await addQuestion(user, "Do you agree to a background check?", "checkbox");
    await user.click(within(card).getByRole("switch", { name: "Screening" }));
    expect(within(card).getByText("Must be ticked.")).toBeInTheDocument();

    await user.selectOptions(within(card).getByRole("combobox", { name: "Answer type" }), "short_text");
    expect(within(card).queryByRole("switch", { name: "Screening" })).not.toBeInTheDocument();

    // Switching back starts without a rule.
    await user.selectOptions(within(card).getByRole("combobox", { name: "Answer type" }), "checkbox");
    expect(within(card).getByRole("switch", { name: "Screening" })).toHaveAttribute("aria-checked", "false");

    await save(user);
    await waitFor(() => expect(putCalls(fetchMock)).toHaveLength(1));
    expect((lastPutBody(fetchMock).fields ?? [])[1]?.screening).toBeNull();
  });

  it("surfaces the backend's validation message", async () => {
    mockFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/jobs/5/form") && method === "PUT") {
        return jsonResponse(
          { error: { code: "bad_request", message: "Choose the expected answer (Yes or No) for 'Willing to relocate?'." } },
          400,
        );
      }
      if (url.endsWith("/jobs/5/form")) return jsonResponse(form);
      if (url.endsWith("/jobs/5")) return jsonResponse(job);
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
    const user = userEvent.setup();

    renderBuilder();

    await user.type(await screen.findByRole("textbox", { name: "Form title" }), "!");
    await save(user);

    expect(await screen.findByText("The form wasn't saved")).toBeInTheDocument();
    expect(screen.getAllByText(/Choose the expected answer \(Yes or No\)/).length).toBeGreaterThan(0);
  });
});
