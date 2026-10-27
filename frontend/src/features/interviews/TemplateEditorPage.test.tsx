import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { InterviewTemplate, InterviewTemplateInput } from "@/types/api";
import { TemplateEditorPage } from "./TemplateEditorPage";

const rubric = [1, 2, 3, 4, 5].map((score) => ({ score, descriptor: `Level ${score} behaviour` }));

const suggestion: InterviewTemplateInput = {
  job_id: 3,
  name: "Data Scientist — first interview",
  language: "id",
  mode: "template",
  cv_questions: 2,
  competencies: [
    { name: "Problem solving", description: "Structures ambiguous problems.", weight: 3, rubric },
    { name: "Communication", description: "Explains results clearly.", weight: 1, rubric },
  ],
  questions: [
    { id: "q1", competency: "Problem solving", text: "Describe a hard modelling problem you solved." },
    { id: "q2", competency: "Communication", text: "How do you explain a model to non-experts?" },
  ],
  num_questions: 2,
  duration_minutes: 20,
  follow_up_rules: { max_follow_ups_per_question: 1, min_answer_words: 20 },
  invitation_expiry_hours: 72,
};

const created: InterviewTemplate = {
  ...suggestion,
  id: 42,
  job_title: "Data Scientist",
  status: "draft",
  approved_by: null,
  created_at: "2026-10-22T08:00:00Z",
  updated_at: "2026-10-22T08:00:00Z",
};

const jobsPage = {
  items: [{ id: 3, title: "Data Scientist", status: "open" }],
  total: 1,
  page: 1,
  page_size: 100,
};

function renderEditor(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/interviews/templates/new" element={<TemplateEditorPage />} />
      <Route path="/interviews/templates/:id" element={<TemplateEditorPage />} />
    </Routes>,
    { route },
  );
}

describe("TemplateEditorPage", () => {
  it("fills the form from a suggestion and creates a draft template", async () => {
    const fetchMock = mockFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/jobs")) return jsonResponse(jobsPage);
      if (url.endsWith("/interview-templates/suggest") && method === "POST") return jsonResponse(suggestion);
      if (url.endsWith("/interview-templates") && method === "POST") return jsonResponse(created, 201);
      if (url.endsWith("/interview-templates/42")) return jsonResponse(created);
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
    const user = userEvent.setup();

    renderEditor("/interviews/templates/new?job_id=3");

    await waitFor(() => expect(screen.getByRole("option", { name: "Data Scientist" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /suggest from job/i }));

    expect(await screen.findByDisplayValue("Data Scientist — first interview")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^name/i })[0]).toHaveValue("Problem solving");
    // Relative weights 3:1 -> 75% / 25% share.
    expect(screen.getByText("75% of score")).toBeInTheDocument();
    expect(screen.getByText("25% of score")).toBeInTheDocument();
    // Indonesian suggestion with 2 CV-based questions; HR switches to English and 3 CV questions.
    const language = screen.getByRole("combobox", { name: /interview language/i });
    expect(language).toHaveValue("id");
    const cvQuestions = screen.getByRole("spinbutton", { name: /cv-based questions per candidate/i });
    expect(cvQuestions).toHaveValue(2);
    expect(screen.getByText(/Pendalaman Pengalaman CV/)).toBeInTheDocument();
    await user.selectOptions(language, "en");
    await user.clear(cvQuestions);
    await user.type(cvQuestions, "3");
    expect(screen.getByText("Each interview asks 5 questions in total.")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: /save as draft/i })[0] as HTMLElement);

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) => String(input).endsWith("/interview-templates") && init?.method === "POST",
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall?.[1]?.body)) as InterviewTemplateInput;
      expect(body.job_id).toBe(3);
      expect(body.language).toBe("en");
      expect(body.cv_questions).toBe(3);
      expect(body.competencies).toHaveLength(2);
      expect(body.competencies[0]?.rubric.map((level) => level.score)).toEqual([1, 2, 3, 4, 5]);
      expect(body.questions.map((question) => question.id)).toEqual(["q1", "q2"]);
    });

    // Navigates to the saved template, which can now be approved.
    expect(await screen.findByRole("button", { name: /^approve$/i })).toBeInTheDocument();
  });

  it("rejects more than 5 CV-based questions", async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes("/jobs")) return jsonResponse(jobsPage);
      return jsonResponse({ error: { code: "unexpected", message: "Unexpected call" } }, 500);
    });
    const user = userEvent.setup();

    renderEditor("/interviews/templates/new?job_id=3");
    await waitFor(() => expect(screen.getByRole("option", { name: "Data Scientist" })).toBeInTheDocument());
    // New templates default to Bahasa Indonesia with 2 CV questions.
    expect(screen.getByRole("combobox", { name: /interview language/i })).toHaveValue("id");
    const cvQuestions = screen.getByRole("spinbutton", { name: /cv-based questions per candidate/i });
    expect(cvQuestions).toHaveValue(2);

    await user.clear(cvQuestions);
    await user.type(cvQuestions, "6");
    await user.click(screen.getAllByRole("button", { name: /save as draft/i })[0] as HTMLElement);

    expect(await screen.findByText("CV-based questions must be at most 5")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("blocks saving and shows field errors when required fields are missing", async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes("/jobs")) return jsonResponse(jobsPage);
      return jsonResponse({ error: { code: "unexpected", message: "Unexpected call" } }, 500);
    });
    const user = userEvent.setup();

    renderEditor("/interviews/templates/new?job_id=3");
    await waitFor(() => expect(screen.getByRole("option", { name: "Data Scientist" })).toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: /save as draft/i })[0] as HTMLElement);

    expect(await screen.findByText("Template name is required")).toBeInTheDocument();
    expect(screen.getByText("Competency name is required")).toBeInTheDocument();
    expect(screen.getByText("Add at least one question")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("lists exactly which fields are wrong, including hidden rubric levels", async () => {
    mockFetch((url, init) => {
      if (url.includes("/jobs")) return jsonResponse(jobsPage);
      if (url.endsWith("/interview-templates/suggest") && init?.method === "POST") return jsonResponse(suggestion);
      return jsonResponse({ error: { code: "unexpected", message: "Unexpected call" } }, 500);
    });
    const user = userEvent.setup();

    renderEditor("/interviews/templates/new?job_id=3");
    await waitFor(() => expect(screen.getByRole("option", { name: "Data Scientist" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /suggest from job/i }));
    await screen.findByDisplayValue("Data Scientist — first interview");
    // Clear one rubric descriptor of the second competency (its rubric panel is collapsed when complete).
    await user.click(screen.getAllByRole("button", { name: /scoring rubric/i })[1] as HTMLElement);
    const level3 = await waitFor(() => {
      const input = document.querySelector<HTMLTextAreaElement>('[name="competencies.1.rubric.2.descriptor"]');
      expect(input).not.toBeNull();
      return input as HTMLTextAreaElement;
    });
    await user.clear(level3);
    await user.click(screen.getAllByRole("button", { name: /save as draft/i })[0] as HTMLElement);

    expect(await screen.findByText(/can't be saved yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Competency 2 “Communication” – rubric level 3/ })).toBeInTheDocument();
  });

  it("keeps 'questions per interview' valid when a question is deleted", async () => {
    const fetchMock = mockFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/jobs")) return jsonResponse(jobsPage);
      if (url.endsWith("/interview-templates/suggest") && method === "POST") return jsonResponse(suggestion);
      if (url.endsWith("/interview-templates") && method === "POST") return jsonResponse(created, 201);
      if (url.endsWith("/interview-templates/42")) return jsonResponse(created);
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
    const user = userEvent.setup();

    renderEditor("/interviews/templates/new?job_id=3");
    await waitFor(() => expect(screen.getByRole("option", { name: "Data Scientist" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /suggest from job/i }));
    await screen.findByDisplayValue("Data Scientist — first interview");
    expect(screen.getByRole("spinbutton", { name: /template questions per interview/i })).toHaveValue(2);

    await user.click(screen.getByRole("button", { name: "Delete question 2" }));
    expect(screen.getByRole("spinbutton", { name: /template questions per interview/i })).toHaveValue(1);
    await user.click(screen.getAllByRole("button", { name: /save as draft/i })[0] as HTMLElement);

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) => String(input).endsWith("/interview-templates") && init?.method === "POST",
      );
      expect(createCall).toBeDefined();
      expect((JSON.parse(String(createCall?.[1]?.body)) as InterviewTemplateInput).num_questions).toBe(1);
    });
  });

  it("switches to the conversational style: snaps the settings, hides CV/follow-up settings and sends the mode", async () => {
    const fetchMock = mockFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/jobs")) return jsonResponse(jobsPage);
      if (url.endsWith("/interview-templates/suggest") && method === "POST") return jsonResponse(suggestion);
      if (url.endsWith("/interview-templates") && method === "POST") return jsonResponse({ ...created, mode: "conversational" }, 201);
      if (url.endsWith("/interview-templates/42")) return jsonResponse({ ...created, mode: "conversational" });
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
    const user = userEvent.setup();

    renderEditor("/interviews/templates/new?job_id=3");
    await waitFor(() => expect(screen.getByRole("option", { name: "Data Scientist" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /suggest from job/i }));
    await screen.findByDisplayValue("Data Scientist — first interview");

    // Fixed questions is the default.
    expect(screen.getByRole("radio", { name: "Fixed questions" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("spinbutton", { name: /cv-based questions per candidate/i })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /max\. follow-ups per question/i })).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: /conversational/i }));

    expect(screen.getByRole("radio", { name: /conversational/i })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText(/asks them to introduce themselves/i)).toBeInTheDocument();
    // 2 questions / 20 minutes are outside 3–5 / 5–10: snapped to 5 questions and 7 minutes.
    expect(screen.getByRole("spinbutton", { name: /number of questions/i })).toHaveValue(5);
    expect(screen.getByRole("spinbutton", { name: /expected duration/i })).toHaveValue(7);
    expect(screen.queryByRole("spinbutton", { name: /cv-based questions per candidate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /follow-ups per question/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /min\. answer length/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /guidance questions \(optional — used as a fallback\)/i })).toBeInTheDocument();

    // Guidance questions are optional: delete both.
    await user.click(screen.getByRole("button", { name: "Delete question 2" }));
    await user.click(screen.getByRole("button", { name: "Delete question 1" }));
    // Out-of-range values are rejected.
    const duration = screen.getByRole("spinbutton", { name: /expected duration/i });
    await user.clear(duration);
    await user.type(duration, "12");
    await user.click(screen.getAllByRole("button", { name: /save as draft/i })[0] as HTMLElement);
    expect(await screen.findByText("Conversational interviews last 5–10 minutes")).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([input, init]) => String(input).endsWith("/interview-templates") && init?.method === "POST"),
    ).toBe(false);

    await user.clear(duration);
    await user.type(duration, "8");
    const count = screen.getByRole("spinbutton", { name: /number of questions/i });
    await user.clear(count);
    await user.type(count, "4");
    await user.click(screen.getAllByRole("button", { name: /save as draft/i })[0] as HTMLElement);

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) => String(input).endsWith("/interview-templates") && init?.method === "POST",
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall?.[1]?.body)) as InterviewTemplateInput;
      expect(body.mode).toBe("conversational");
      expect(body.num_questions).toBe(4);
      expect(body.duration_minutes).toBe(8);
      expect(body.questions).toEqual([]);
      expect(body.competencies).toHaveLength(2);
      // Ignored in conversational mode, but still sent unchanged.
      expect(body.cv_questions).toBe(2);
      expect(body.follow_up_rules).toEqual({ max_follow_ups_per_question: 1, min_answer_words: 20 });
    });
  });

  it("sends mode \"template\" for fixed-question templates", async () => {
    const fetchMock = mockFetch((url, init) => {
      const method = init?.method ?? "GET";
      if (url.includes("/jobs")) return jsonResponse(jobsPage);
      if (url.endsWith("/interview-templates/suggest") && method === "POST") return jsonResponse(suggestion);
      if (url.endsWith("/interview-templates") && method === "POST") return jsonResponse(created, 201);
      if (url.endsWith("/interview-templates/42")) return jsonResponse(created);
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
    const user = userEvent.setup();

    renderEditor("/interviews/templates/new?job_id=3");
    await waitFor(() => expect(screen.getByRole("option", { name: "Data Scientist" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /suggest from job/i }));
    await screen.findByDisplayValue("Data Scientist — first interview");
    await user.click(screen.getAllByRole("button", { name: /save as draft/i })[0] as HTMLElement);

    await waitFor(() => {
      const createCall = fetchMock.mock.calls.find(
        ([input, init]) => String(input).endsWith("/interview-templates") && init?.method === "POST",
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall?.[1]?.body)) as InterviewTemplateInput;
      expect(body.mode).toBe("template");
      expect(body.num_questions).toBe(2);
    });
  });
});
