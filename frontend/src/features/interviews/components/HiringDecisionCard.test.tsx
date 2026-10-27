import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StatusBadge } from "@/components/ui";
import { makeApplication } from "@/features/shortlist/test-fixtures";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { Application, InterviewSession } from "@/types/api";
import { HiringDecisionCard } from "./HiringDecisionCard";
import { InterviewSessionsTable } from "./InterviewSessionsTable";

const eligible: Application = makeApplication(7, {
  candidate_name: "Alex Doe",
  job_title: "Data Scientist",
  stage: "interview",
  has_completed_interview: true,
});

describe("HiringDecisionCard", () => {
  it("lets HR accept with a note and posts the decision", async () => {
    const fetchMock = mockFetch((url, init) => {
      if (url.endsWith("/applications/7/decision") && init?.method === "POST") {
        return jsonResponse({ ...eligible, stage: "hired", decision: "accepted", decision_note: "Great fit" });
      }
      return jsonResponse({ items: [], total: 0, page: 1, page_size: 20 });
    });
    const user = userEvent.setup();
    renderWithProviders(<HiringDecisionCard application={eligible} />);

    expect(screen.getByText("HR decision")).toBeInTheDocument();
    expect(screen.getByText("Final decision after reviewing the interview. This can't be changed.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(screen.getByRole("dialog", { name: "Accept Alex Doe for Data Scientist?" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Note (optional)"), "Great fit");
    await user.click(screen.getByRole("button", { name: "Accept candidate" }));

    await waitFor(() => expect(screen.getByText("Candidate accepted")).toBeInTheDocument());
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/applications/7/decision"));
    expect(call?.[1]?.method).toBe("POST");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ decision: "accepted", note: "Great fit" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("rejects without a note", async () => {
    const fetchMock = mockFetch(() => jsonResponse({ ...eligible, stage: "rejected", decision: "rejected" }));
    const user = userEvent.setup();
    renderWithProviders(<HiringDecisionCard application={eligible} />);

    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(screen.getByRole("dialog", { name: "Reject Alex Doe for Data Scientist?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject candidate" }));

    await waitFor(() => expect(screen.getByText("Candidate rejected")).toBeInTheDocument());
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/applications/7/decision"));
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ decision: "rejected" });
  });

  it("shows a waiting line until the interview is completed", () => {
    renderWithProviders(<HiringDecisionCard application={{ ...eligible, has_completed_interview: false }} />);
    expect(screen.getByText("Available after the AI interview is completed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("shows nothing before the interview stage", () => {
    const { container } = renderWithProviders(<HiringDecisionCard application={{ ...eligible, stage: "screening" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the decided result without buttons", () => {
    const decided: Application = {
      ...eligible,
      stage: "hired",
      decision: "accepted",
      decision_note: "Offer sent",
      decided_by: "Rika Recruiter",
      decided_at: "2026-10-25T10:00:00Z",
    };
    renderWithProviders(<HiringDecisionCard application={decided} />);
    expect(screen.getByText("Accepted · Hired")).toBeInTheDocument();
    expect(screen.getByText(/by Rika Recruiter/)).toBeInTheDocument();
    expect(screen.getByText("Offer sent")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows a rejected result", () => {
    renderWithProviders(
      <HiringDecisionCard application={{ ...eligible, stage: "rejected", decision: "rejected", decided_by: "Rika" }} />,
    );
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });
});

describe("Decision column and stage colors", () => {
  const base: InterviewSession = {
    id: 1,
    application_id: 7,
    candidate_name: "Alex Doe",
    job_title: "Data Scientist",
    template_id: 11,
    template_name: "Template",
    status: "completed",
    expires_at: "2030-01-01T00:00:00Z",
    started_at: null,
    completed_at: null,
    language: "en",
    mode: "template",
    questions: [],
    questions_total: 2,
    questions_answered: 2,
    invitation_email: null,
    messages: [],
    evaluation_status: null,
    application_stage: "interview",
    application_decision: null,
    application_has_completed_interview: true,
    created_at: "2026-10-19T00:00:00Z",
  };

  it("renders Accepted / Rejected / — in the interview list", () => {
    renderWithProviders(
      <InterviewSessionsTable
        sessions={[
          { ...base, id: 1, application_decision: "accepted", application_stage: "hired" },
          { ...base, id: 2, application_decision: "rejected", application_stage: "rejected" },
          { ...base, id: 3 },
        ]}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Decision" })).toBeInTheDocument();
    expect(screen.getByText("Accepted")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByLabelText("No decision")).toBeInTheDocument();
  });

  it("colors hired green and rejected red", () => {
    renderWithProviders(
      <>
        <StatusBadge kind="stage" value="hired" />
        <StatusBadge kind="stage" value="rejected" />
      </>,
    );
    expect(screen.getByText("Hired").closest("span[class*='bg-']")?.className).toContain("emerald");
    expect(screen.getByText("Rejected").closest("span[class*='bg-']")?.className).toContain("rose");
  });
});
