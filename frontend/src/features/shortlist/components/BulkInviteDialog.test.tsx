import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { BulkInviteInput, BulkInviteResponse, CandidateSummary, InterviewTemplate, Paginated } from "@/types/api";
import { BulkInviteDialog, type BulkInviteRecipient } from "./BulkInviteDialog";

const template: InterviewTemplate = {
  id: 11,
  job_id: 5,
  job_title: "Data Scientist",
  name: "Wawancara awal",
  language: "id",
  mode: "template",
  cv_questions: 2,
  competencies: [],
  questions: [],
  num_questions: 6,
  duration_minutes: 30,
  follow_up_rules: { max_follow_ups_per_question: 1, min_answer_words: 20 },
  invitation_expiry_hours: 72,
  status: "approved",
  approved_by: "Ada Admin",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const recipients: BulkInviteRecipient[] = [
  { applicationId: 1, candidateId: 101, candidateName: "Ayu Lestari" },
  { applicationId: 2, candidateId: 102, candidateName: "Budi Santoso" },
  { applicationId: 3, candidateId: 103, candidateName: "Citra Dewi" },
];

function candidate(id: number, name: string, email: string | null): CandidateSummary {
  return {
    id,
    full_name: name,
    email,
    phone: null,
    top_skills: [],
    latest_document_status: "completed",
    best_match_score: 80,
    applications: [],
    is_demo: false,
    created_at: "2026-10-01T00:00:00Z",
  };
}

const candidates: Paginated<CandidateSummary> = {
  items: [
    candidate(101, "Ayu Lestari", "ayu@example.com"),
    candidate(102, "Budi Santoso", null),
    candidate(103, "Citra Dewi", "citra@example.com"),
  ],
  total: 3,
  page: 1,
  page_size: 100,
};

const notConfiguredResponse: BulkInviteResponse = {
  results: [
    {
      application_id: 1,
      candidate_name: "Ayu Lestari",
      email: "ayu@example.com",
      status: "invited",
      session_id: 51,
      invitation_url: "http://localhost:5173/interview#token-ayu",
      cv_questions: 2,
      email_status: "not_configured",
      email_error: null,
    },
    {
      application_id: 2,
      candidate_name: "Budi Santoso",
      email: null,
      status: "invited",
      session_id: 52,
      invitation_url: "http://localhost:5173/interview#token-budi",
      cv_questions: 2,
      email_status: "not_configured",
      email_error: null,
    },
    {
      application_id: 3,
      candidate_name: "Citra Dewi",
      email: "citra@example.com",
      status: "skipped",
      reason: "An active invitation already exists",
    },
  ],
  invited: 2,
  emailed: 0,
  smtp_configured: false,
};

function setup(response: BulkInviteResponse) {
  return mockFetch((url, init) => {
    if (url.includes("/jobs/5/interviews/bulk-invite") && init?.method === "POST") return jsonResponse(response);
    if (url.includes("/interview-templates")) return jsonResponse([template]);
    if (url.includes("/candidates")) return jsonResponse(candidates);
    return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
  });
}

describe("BulkInviteDialog", () => {
  it("shows recipients, sends the invitations and lists per-candidate results with copyable links", async () => {
    const fetchMock = setup(notConfiguredResponse);
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderWithProviders(<BulkInviteDialog open onClose={onClose} jobId={5} recipients={recipients} />);

    // Template details: language, CV questions and total questions.
    const option = await screen.findByRole("radio", { name: /wawancara awal/i });
    expect(option).toBeChecked();
    expect(screen.getByText("Bahasa Indonesia")).toBeInTheDocument();
    expect(screen.getByText(/8 questions in total/)).toBeInTheDocument();

    // Recipients with emails, and a warning for the one without.
    expect(await screen.findByText("ayu@example.com")).toBeInTheDocument();
    expect(screen.getByText("No email")).toBeInTheDocument();
    expect(screen.getByText("1 candidate without an email address")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /send invitation emails/i })).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Send 3 invitations" }));

    const results = await screen.findByRole("list", { name: "Invitation results" });
    const call = fetchMock.mock.calls.find(([input]) => String(input).includes("/bulk-invite"));
    expect(JSON.parse(String(call?.[1]?.body)) as BulkInviteInput).toEqual({
      template_id: 11,
      application_ids: [1, 2, 3],
      send_email: true,
    });

    expect(screen.getByText(/email isn't configured on the server/i)).toBeInTheDocument();
    expect(screen.getByText(/won't be shown again/i)).toBeInTheDocument();

    const ayu = within(results).getByTestId("bulk-result-1");
    expect(within(ayu).getByText("Invited")).toBeInTheDocument();
    expect(within(ayu).getByText("SMTP not configured")).toBeInTheDocument();
    expect(within(ayu).getByLabelText("Interview link for Ayu Lestari")).toHaveValue(
      "http://localhost:5173/interview#token-ayu",
    );

    const citra = within(results).getByTestId("bulk-result-3");
    expect(within(citra).getByText("Skipped")).toBeInTheDocument();
    expect(within(citra).getByText("An active invitation already exists")).toBeInTheDocument();
    expect(within(citra).queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(within(ayu).getByRole("button", { name: "Copy link for Ayu Lestari" }));
    await waitFor(() => expect(within(ayu).getByRole("button", { name: "Copied" })).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Copy all links (2)" }));
    await waitFor(async () => {
      const text = await navigator.clipboard.readText();
      expect(text).toContain("Ayu Lestari <ayu@example.com>: http://localhost:5173/interview#token-ayu");
      expect(text).toContain("Budi Santoso: http://localhost:5173/interview#token-budi");
    });

    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows email status per candidate and hides links that were emailed", async () => {
    setup({
      results: [
        { ...notConfiguredResponse.results[0]!, email_status: "sent" },
        {
          ...notConfiguredResponse.results[1]!,
          email: "budi@example.com",
          email_status: "failed",
          email_error: "Mailbox unavailable",
        },
      ],
      invited: 2,
      emailed: 1,
      smtp_configured: true,
    });
    const user = userEvent.setup();

    renderWithProviders(<BulkInviteDialog open onClose={() => undefined} jobId={5} recipients={recipients.slice(0, 2)} />);
    await user.click(await screen.findByRole("button", { name: "Send 2 invitations" }));

    const results = await screen.findByRole("list", { name: "Invitation results" });
    const ayu = within(results).getByTestId("bulk-result-1");
    expect(within(ayu).getByText("Email sent")).toBeInTheDocument();
    expect(within(ayu).queryByRole("textbox")).not.toBeInTheDocument();

    const budi = within(results).getByTestId("bulk-result-2");
    expect(within(budi).getByText("Email failed")).toBeInTheDocument();
    expect(within(budi).getByText("Mailbox unavailable")).toBeInTheDocument();
    expect(within(budi).getByRole("textbox")).toHaveValue("http://localhost:5173/interview#token-budi");
    expect(screen.getByRole("button", { name: "Copy all links (1)" })).toBeInTheDocument();
  });

  it("links to template creation when the job has no approved template", async () => {
    mockFetch((url) => {
      if (url.includes("/interview-templates")) return jsonResponse([{ ...template, status: "draft" }]);
      if (url.includes("/candidates")) return jsonResponse(candidates);
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });

    renderWithProviders(<BulkInviteDialog open onClose={() => undefined} jobId={5} recipients={recipients} />);

    expect(await screen.findByText("No approved interview template for this job")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create template" })).toHaveAttribute("href", "/interviews/templates/new?job_id=5");
  });
});
