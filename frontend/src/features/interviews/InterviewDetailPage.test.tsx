import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { InterviewSession } from "@/types/api";
import { InterviewDetailPage } from "./InterviewDetailPage";

const session: InterviewSession = {
  id: 5,
  application_id: 7,
  candidate_name: "Alex Doe",
  job_title: "Data Scientist",
  template_id: 11,
  template_name: "Approved template",
  status: "in_progress",
  expires_at: "2030-01-01T00:00:00Z",
  started_at: "2026-10-20T09:00:00Z",
  completed_at: null,
  language: "id",
  mode: "template",
  questions: [
    {
      id: "cv1",
      competency: "Pendalaman Pengalaman CV",
      text: "Ceritakan proyek churn model di PT Maju Jaya.",
      source: "cv",
      cv_basis: "Built a churn prediction model at PT Maju Jaya (2022–2024)",
      cv_basis_line: 14,
    },
    { id: "q1", competency: "Problem solving", text: "Describe a hard modelling problem you solved.", source: "template", cv_basis: null, cv_basis_line: null },
  ],
  invitation_email: {
    id: 3,
    to_email: "alex@example.com",
    subject: "Undangan AI Interview",
    status: "not_configured",
    error: null,
    kind: "interview_invitation",
    session_id: 5,
    created_at: "2026-10-19T00:00:00Z",
  },
  questions_total: 4,
  questions_answered: 1,
  messages: [
    {
      id: 1,
      role: "assistant",
      content: "Ceritakan proyek churn model di PT Maju Jaya.",
      question_id: "cv1",
      competency: "Problem solving",
      is_follow_up: false,
      input_mode: null,
      mode_used: null,
      created_at: "2026-10-20T09:01:00Z",
    },
    {
      id: 2,
      role: "candidate",
      content: "I rebuilt the churn model.",
      question_id: "q1",
      competency: null,
      is_follow_up: false,
      input_mode: "voice",
      mode_used: null,
      created_at: "2026-10-20T09:03:00Z",
    },
    {
      id: 3,
      role: "assistant",
      content: "What was the measurable impact?",
      question_id: "q1",
      competency: "Problem solving",
      is_follow_up: true,
      input_mode: null,
      mode_used: null,
      created_at: "2026-10-20T09:04:00Z",
    },
  ],
  evaluation_status: null,
  application_stage: "interview",
  application_decision: null,
  application_has_completed_interview: false,
  created_at: "2026-10-19T00:00:00Z",
};

function renderDetail(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/interviews/:id" element={<InterviewDetailPage />} />
    </Routes>,
    { route },
  );
}

describe("InterviewDetailPage", () => {
  it("renders the transcript, highlights the #message anchor and lets HR revoke", async () => {
    let current: InterviewSession = session;
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith("/interviews/5/revoke") && init?.method === "POST") {
        current = { ...session, status: "revoked" };
      }
      return jsonResponse(current);
    });
    const user = userEvent.setup();

    renderDetail("/interviews/5#message-2");

    expect(await screen.findByRole("heading", { name: "Alex Doe" })).toBeInTheDocument();
    expect(screen.getByText("Follow-up")).toBeInTheDocument();
    await waitFor(() => expect(document.getElementById("message-2")).toHaveAttribute("aria-current", "true"));
    expect(screen.getByRole("button", { name: /force complete/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /revoke invitation/i }));
    const dialog = await screen.findByRole("dialog", { name: /revoke this invitation/i });
    await user.click(within(dialog).getByRole("button", { name: /revoke invitation/i }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([input]) => String(input).endsWith("/interviews/5/revoke"))).toBe(true),
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: /revoke invitation/i })).not.toBeInTheDocument());
  });

  it("shows the session language, CV-based questions, input mode and invitation email status", async () => {
    mockFetch(() => jsonResponse(session));

    renderDetail("/interviews/5");

    expect(await screen.findByRole("heading", { name: "Alex Doe" })).toBeInTheDocument();
    expect(screen.getAllByText("Bahasa Indonesia").length).toBeGreaterThan(0);

    const questions = screen.getByRole("list", { name: "Session questions" });
    const items = within(questions).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText("From CV")).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/Built a churn prediction model at PT Maju Jaya/)).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).getByText(/Based on CV line 14/)).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).queryByText("From CV")).not.toBeInTheDocument();

    // The CV question is marked in the transcript as well; the candidate's answer shows its input mode.
    const transcript = screen.getByRole("list", { name: "Interview transcript" });
    expect(within(transcript).getByText("From CV")).toBeInTheDocument();
    expect(within(transcript).getByText("Voice")).toBeInTheDocument();

    expect(screen.getByText("SMTP not configured")).toBeInTheDocument();
    expect(screen.getByText("alex@example.com")).toBeInTheDocument();
  });

  it("marks conversational sessions and which turns used the AI or the scripted fallback", async () => {
    const conversational: InterviewSession = {
      ...session,
      mode: "conversational",
      questions: [
        { id: "c1", competency: "Komunikasi", text: "Perkenalan diri", source: "template", cv_basis: null, cv_basis_line: null },
        { id: "c5", competency: null, text: "Ada pertanyaan tentang posisi ini?", source: "template", cv_basis: null, cv_basis_line: null },
      ],
      messages: [
        { ...session.messages[0]!, id: 1, question_id: "c1", content: "Halo Alex! Silakan perkenalkan diri Anda.", mode_used: "llm" },
        { ...session.messages[1]!, id: 2, question_id: "c1", content: "Saya Alex." },
        {
          ...session.messages[0]!,
          id: 3,
          question_id: "c5",
          competency: null,
          content: "Apakah ada yang ingin Anda tanyakan tentang posisi ini?",
          mode_used: "fallback",
        },
      ],
    };
    mockFetch(() => jsonResponse(conversational));

    renderDetail("/interviews/5");

    expect(await screen.findByRole("heading", { name: "Alex Doe" })).toBeInTheDocument();
    // Session style: in the header and the details card.
    const modeBadges = screen.getAllByText("Conversational");
    expect(modeBadges.length).toBeGreaterThanOrEqual(1);
    expect(modeBadges[0]).toHaveAttribute("data-interview-mode", "conversational");

    const transcript = screen.getByRole("list", { name: "Interview transcript" });
    const ai = within(transcript).getByText("AI");
    expect(ai).toHaveAttribute("data-mode-used", "llm");
    const fallback = within(transcript).getByText("Fallback");
    expect(fallback).toHaveAttribute("title", expect.stringMatching(/AI was unavailable/i));
    // Candidate answers never carry a turn badge.
    expect(within(transcript).getAllByText(/^(AI|Fallback)$/)).toHaveLength(2);

    // The final "any questions?" slot has no competency chip.
    const questions = screen.getByRole("list", { name: "Session questions" });
    expect(within(questions).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Planned conversation")).toBeInTheDocument();
  });

  it("labels fixed-question sessions without turn badges", async () => {
    mockFetch(() => jsonResponse(session));

    renderDetail("/interviews/5");

    expect(await screen.findByRole("heading", { name: "Alex Doe" })).toBeInTheDocument();
    expect(screen.getAllByText("Fixed questions")[0]).toHaveAttribute("data-interview-mode", "template");
    const transcript = screen.getByRole("list", { name: "Interview transcript" });
    expect(within(transcript).queryByText("AI")).not.toBeInTheDocument();
    expect(within(transcript).queryByText("Fallback")).not.toBeInTheDocument();
  });
});
