import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { InterviewEvaluation, InterviewSession } from "@/types/api";
import { EvaluationPage } from "./EvaluationPage";

const session: InterviewSession = {
  id: 5,
  application_id: 7,
  candidate_name: "Alex Doe",
  job_title: "Data Scientist",
  template_id: 11,
  template_name: "Approved template",
  status: "completed",
  expires_at: "2030-01-01T00:00:00Z",
  started_at: "2026-10-20T09:00:00Z",
  completed_at: "2026-10-20T09:30:00Z",
  language: "en",
  mode: "template",
  questions: [],
  invitation_email: null,
  questions_total: 2,
  questions_answered: 2,
  messages: [
    {
      id: 1,
      role: "assistant",
      content: "Describe a hard modelling problem you solved.",
      question_id: "q1",
      competency: "Problem solving",
      is_follow_up: false,
      input_mode: null,
      mode_used: null,
      created_at: "2026-10-20T09:01:00Z",
    },
    {
      id: 2,
      role: "candidate",
      content: "I reduced churn prediction error by redesigning the features.",
      question_id: "q1",
      competency: null,
      is_follow_up: false,
      input_mode: "voice",
      mode_used: null,
      created_at: "2026-10-20T09:03:00Z",
    },
  ],
  evaluation_status: "needs_review",
  application_stage: "interview",
  application_decision: null,
  application_has_completed_interview: true,
  created_at: "2026-10-19T00:00:00Z",
};

const evaluation: InterviewEvaluation = {
  id: 30,
  session_id: 5,
  status: "needs_review",
  method: "llm:claude-x",
  overall_score: 62,
  overall_summary: "Solid problem solving, little evidence on communication.",
  competencies: [
    {
      competency: "Problem solving",
      score: 3,
      rubric_level: "Breaks problems down with some guidance.",
      evidence: [{ quote: "redesigning the features", message_id: 2 }],
      strengths: ["Concrete example"],
      gaps: ["No metrics on impact"],
      insufficient_evidence: false,
    },
    {
      competency: "Communication",
      score: null,
      rubric_level: null,
      evidence: [],
      strengths: [],
      gaps: [],
      insufficient_evidence: true,
    },
  ],
  unanswered_areas: ["Stakeholder management"],
  error_message: null,
  reviewer_notes: null,
  reviewed_by: null,
  reviewed_at: null,
  created_at: "2026-10-20T09:31:00Z",
};

describe("EvaluationPage", () => {
  it("shows scores, insufficient evidence and links evidence to the transcript", async () => {
    mockFetch((url) => {
      if (url.endsWith("/interviews/5/evaluation")) return jsonResponse(evaluation);
      if (url.endsWith("/interviews/5")) return jsonResponse(session);
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
    const user = userEvent.setup();

    renderWithProviders(
      <Routes>
        <Route path="/interviews/:id/evaluation" element={<EvaluationPage />} />
      </Routes>,
      { route: "/interviews/5/evaluation" },
    );

    expect(await screen.findByText("Needs HR review")).toBeInTheDocument();
    expect(screen.getByText("LLM · claude-x")).toBeInTheDocument();
    expect(screen.getByText(/not a hiring decision/i)).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: /rubric score/i })).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByText("Insufficient evidence — HR review required")).toBeInTheDocument();
    expect(screen.getByText("Stakeholder management")).toBeInTheDocument();
    // Everyone has full HR access: re-run and notes are both available.
    expect(screen.getByRole("button", { name: /re-run evaluation/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /reviewer notes/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /redesigning the features/i }));
    expect(document.getElementById("message-2")).toHaveAttribute("aria-current", "true");
  });
});
