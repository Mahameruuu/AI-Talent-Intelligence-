import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { InterviewInvitation, InterviewSession, InterviewTemplate } from "@/types/api";
import { InviteCandidateDialog } from "./InviteCandidateDialog";

const baseTemplate: InterviewTemplate = {
  id: 10,
  job_id: 3,
  job_title: "Data Scientist",
  name: "Draft template",
  language: "id",
  mode: "template",
  cv_questions: 2,
  competencies: [],
  questions: [],
  num_questions: 5,
  duration_minutes: 25,
  follow_up_rules: { max_follow_ups_per_question: 1, min_answer_words: 20 },
  invitation_expiry_hours: 72,
  status: "draft",
  approved_by: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const approvedTemplate: InterviewTemplate = { ...baseTemplate, id: 11, name: "Approved template", status: "approved", approved_by: "Ada Admin" };

const session: InterviewSession = {
  id: 99,
  application_id: 7,
  candidate_name: "Alex Doe",
  job_title: "Data Scientist",
  template_id: 11,
  template_name: "Approved template",
  status: "pending",
  expires_at: "2030-01-01T00:00:00Z",
  started_at: null,
  completed_at: null,
  language: "id",
  mode: "template",
  questions: [],
  invitation_email: null,
  questions_total: 5,
  questions_answered: 0,
  messages: [],
  evaluation_status: null,
  application_stage: "interview",
  application_decision: null,
  application_has_completed_interview: false,
  created_at: "2026-10-22T00:00:00Z",
};

const invitation: InterviewInvitation = {
  session,
  invitation_url: "http://localhost:5173/interview#secret-token",
  expires_at: "2030-01-01T00:00:00Z",
  email: {
    id: 1,
    to_email: "alex@example.com",
    subject: "Undangan AI Interview",
    status: "sent",
    error: null,
    kind: "interview_invitation",
    session_id: 99,
    created_at: "2026-10-22T00:00:00Z",
  },
};

describe("InviteCandidateDialog", () => {
  it("invites with the approved template and shows the one-time link", async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.includes("/interview-templates")) return jsonResponse([baseTemplate, approvedTemplate]);
      if (url.endsWith("/applications/7/interviews") && init?.method === "POST") return jsonResponse(invitation, 201);
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(
      <InviteCandidateDialog open onClose={onClose} applicationId={7} jobId={3} candidateName="Alex Doe" />,
    );

    // Only approved templates are offered; the single one is preselected.
    const option = await screen.findByRole("radio", { name: /approved template/i });
    expect(option).toBeChecked();
    // Language and the CV-question count of the template are visible before inviting.
    expect(screen.getByText("Bahasa Indonesia")).toBeInTheDocument();
    expect(screen.getByText("2 CV questions")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /send invitation email/i })).toBeChecked();
    expect(screen.queryByRole("radio", { name: /draft template/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create invitation/i }));

    const linkInput = await screen.findByLabelText("Interview link");
    expect(linkInput).toHaveValue(invitation.invitation_url);
    expect(screen.getByText(/copy this link now/i)).toBeInTheDocument();

    const postCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/applications/7/interviews"));
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ template_id: 11, send_email: true });
    expect(screen.getByText("Invitation email sent to alex@example.com")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /copy link/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /copied/i })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /done/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("can skip the invitation email", async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.includes("/interview-templates")) return jsonResponse([approvedTemplate]);
      if (url.endsWith("/applications/7/interviews") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { send_email: boolean };
        return jsonResponse(
          body.send_email ? invitation : { ...invitation, email: null },
          201,
        );
      }
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
    const user = userEvent.setup();

    renderWithProviders(
      <InviteCandidateDialog open onClose={() => undefined} applicationId={7} jobId={3} candidateName="Alex Doe" />,
    );

    await user.click(await screen.findByRole("checkbox", { name: /send invitation email/i }));
    await user.click(screen.getByRole("button", { name: /create invitation/i }));

    expect(await screen.findByText("No email was sent")).toBeInTheDocument();
    expect(screen.getByLabelText("Interview link")).toHaveValue(invitation.invitation_url);
    const postCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/applications/7/interviews"));
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({ template_id: 11, send_email: false });
  });

  it("shows a warning with the link when SMTP isn't configured", async () => {
    mockFetch((url, init) => {
      if (url.includes("/interview-templates")) return jsonResponse([approvedTemplate]);
      if (url.endsWith("/applications/7/interviews") && init?.method === "POST") {
        return jsonResponse({ ...invitation, email: { ...invitation.email, status: "not_configured" } }, 201);
      }
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
    const user = userEvent.setup();

    renderWithProviders(
      <InviteCandidateDialog open onClose={() => undefined} applicationId={7} jobId={3} candidateName="Alex Doe" />,
    );

    await user.click(await screen.findByRole("button", { name: /create invitation/i }));
    expect(await screen.findByText(/email isn't configured on the server/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Interview link")).toHaveValue(invitation.invitation_url);
  });

  it("explains how to get an approved template when none exists", async () => {
    mockFetch(() => jsonResponse([baseTemplate]));

    renderWithProviders(
      <InviteCandidateDialog open onClose={() => undefined} applicationId={7} jobId={3} candidateName="Alex Doe" />,
    );

    expect(await screen.findByText(/no approved interview template for this job/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create template/i })).toHaveAttribute(
      "href",
      "/interviews/templates/new?job_id=3",
    );
    expect(screen.getByRole("link", { name: /view templates/i })).toHaveAttribute("href", "/interviews/templates?job_id=3");
    expect(screen.queryByRole("button", { name: /create invitation/i })).not.toBeInTheDocument();
  });
});
