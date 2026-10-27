import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { makeApplication } from "@/features/shortlist/test-fixtures";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { Application, DocumentInfo, Job, Paginated, ScreeningSummary } from "@/types/api";
import { CandidatesPage } from "./CandidatesPage";

function page<T>(items: T[], pageSize = 20): Paginated<T> {
  return { items, total: items.length, page: 1, page_size: pageSize };
}

function summary(overrides: Partial<ScreeningSummary> = {}): ScreeningSummary {
  return {
    overall_score: 80,
    required_matched: 4,
    required_total: 5,
    needs_review: 0,
    screening_met: 0,
    screening_total: 0,
    knockout_failed: false,
    flags: 0,
    ...overrides,
  };
}

function processingDocument(applicationId: number): DocumentInfo {
  return {
    id: 900 + applicationId,
    application_id: applicationId,
    candidate_id: applicationId + 100,
    filename: "cv.pdf",
    mime_type: "application/pdf",
    size_bytes: 1000,
    status: "processing",
    error_code: null,
    error_message: null,
    page_count: null,
    ocr_used: false,
    pipeline_version: "1",
    steps: [],
    processing_ms: null,
    created_at: "2026-10-20T10:00:00Z",
    processed_at: null,
  };
}

const scheduled: Job["auto_invite"] = {
  enabled: true,
  top_n: 10,
  min_score: null,
  send_at: "2026-10-31T08:00:00+07:00",
  status: "scheduled",
  template_id: 3,
  template_name: "Data Scientist interview",
  ran_at: null,
  invited_count: null,
  skipped: null,
  error: null,
};

const job = { id: 5, title: "Data Scientist", status: "open", auto_invite: scheduled } as Job;

const applications: Application[] = [
  makeApplication(11, {
    candidate_id: 31,
    candidate_name: "Ayu Lestari",
    match_score: 82,
    screening_summary: summary({ overall_score: 82, screening_met: 2, screening_total: 3, knockout_failed: true }),
    form_answers: [{ field_id: "email", label: "Email", type: "email", value: "ayu@example.com" }],
  }),
  makeApplication(12, {
    candidate_name: "Budi Santoso",
    match_score: 60,
    screening_summary: summary({ overall_score: 60, required_matched: 2, screening_met: 3, screening_total: 3 }),
  }),
  makeApplication(13, { candidate_name: "Citra Dewi", match_score: 30, screening_summary: summary({ overall_score: 30 }) }),
  makeApplication(14, { candidate_name: "Dian Pratama", latest_document: processingDocument(14) }),
  makeApplication(15, { candidate_name: "Eko Saputra", stage: "applied" }),
];

function setup(items: Application[] = applications, jobs: Job[] = [job]) {
  return mockFetch((url) => {
    if (url.includes("/applications")) return jsonResponse(page(items));
    if (url.includes("/jobs")) return jsonResponse(page(jobs, 100));
    if (url.includes("/documents/")) return jsonResponse(processingDocument(14));
    return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
  });
}

function applicationCalls(fetchMock: ReturnType<typeof setup>): URL[] {
  return fetchMock.mock.calls
    .map(([input]) => new URL(String(input), "http://localhost"))
    .filter((url) => url.pathname.endsWith("/applications"));
}

function rowOf(name: string): HTMLTableRowElement {
  return screen.getByRole("link", { name }).closest("tr") as HTMLTableRowElement;
}

describe("CandidatesPage", () => {
  it("lists applicants with match category, skills, screening questions, knockout and a detail link", async () => {
    setup();
    renderWithProviders(<CandidatesPage />, { route: "/candidates" });

    const ayu = await screen.findByRole("link", { name: "Ayu Lestari" });
    expect(ayu).toHaveAttribute("href", "/candidates/31?application=11");

    const ayuRow = rowOf("Ayu Lestari");
    expect(within(ayuRow).getByText("Strong match")).toBeInTheDocument();
    expect(within(ayuRow).getByText("ayu@example.com")).toBeInTheDocument();
    expect(within(ayuRow).getByTitle("4 of 5 required skills found in the CV")).toHaveTextContent("4/5");
    expect(within(ayuRow).getByTitle("2 of 3 screening questions answered as expected")).toHaveTextContent("2/3");
    expect(within(ayuRow).getByText("Knockout")).toBeInTheDocument();
    // Job column is shown when no job is selected.
    expect(within(ayuRow).getByText("Data Scientist")).toBeInTheDocument();

    expect(within(rowOf("Budi Santoso")).getByText("Good match")).toBeInTheDocument();
    expect(within(rowOf("Budi Santoso")).queryByText("Knockout")).not.toBeInTheDocument();
    expect(within(rowOf("Citra Dewi")).getByText("Low match")).toBeInTheDocument();
    expect(within(rowOf("Dian Pratama")).getByText("Processing…")).toBeInTheDocument();
    expect(within(rowOf("Eko Saputra")).getByTitle("Not screened yet")).toHaveTextContent("—");

    // No job selected: no shortlist tools.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("sends the job filter and search to the API and ranks by score within a job", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    renderWithProviders(<CandidatesPage />, { route: "/candidates" });

    await screen.findByRole("link", { name: "Ayu Lestari" });
    const first = applicationCalls(fetchMock)[0];
    expect(first?.searchParams.get("sort")).toBe("created");
    expect(first?.searchParams.has("job_id")).toBe(false);

    await user.selectOptions(await screen.findByLabelText("Job"), "5");
    await waitFor(() =>
      expect(applicationCalls(fetchMock).some((url) => url.searchParams.get("job_id") === "5" && url.searchParams.get("sort") === "score")).toBe(
        true,
      ),
    );
    // The Job column is hidden once a job is selected.
    await waitFor(() => expect(screen.queryByRole("columnheader", { name: "Job" })).not.toBeInTheDocument());

    await user.type(screen.getByLabelText("Search"), "ayu");
    await waitFor(() =>
      expect(applicationCalls(fetchMock).some((url) => url.searchParams.get("q") === "ayu" && url.searchParams.get("job_id") === "5")).toBe(
        true,
      ),
    );
  });

  it("adds shortlist selection to the same table when a job is selected", async () => {
    setup();
    renderWithProviders(<CandidatesPage />, { route: "/candidates?job_id=5" });

    await screen.findByRole("link", { name: "Ayu Lestari" });
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /select top 10/i })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select Ayu Lestari" })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Select Ayu Lestari" }));
    const bar = screen.getByRole("region", { name: "Shortlist actions" });
    expect(within(bar).getByText("1 selected")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: /shortlist & invite to ai interview/i })).toBeInTheDocument();
  });

  it("points to job creation when there are no jobs yet", async () => {
    setup([], []);
    renderWithProviders(<CandidatesPage />, { route: "/candidates" });

    expect(await screen.findByText("No jobs yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create a job/i })).toHaveAttribute("href", "/jobs/new");
  });

  it("links to the job's application form when a job has no applicants", async () => {
    setup([]);
    renderWithProviders(<CandidatesPage />, { route: "/candidates?job_id=5" });

    expect(await screen.findByText("No applicants for Data Scientist yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open application form/i })).toHaveAttribute("href", "/jobs/5/form");
  });

  describe("automatic AI-interview invitations", () => {
    function setupRun(runResponse: () => Response) {
      return mockFetch((url, init) => {
        if (url.includes("/auto-invite/run") && init?.method === "POST") return runResponse();
        if (url.includes("/applications")) return jsonResponse(page(applications));
        if (url.includes("/jobs")) return jsonResponse(page([job], 100));
        if (url.includes("/documents/")) return jsonResponse(processingDocument(14));
        return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
      });
    }

    it("shows when invitations go out and sends them now after confirming", async () => {
      const sent: Job = {
        ...job,
        auto_invite: { ...scheduled, status: "sent", ran_at: "2026-10-27T10:00:00+07:00", invited_count: 8 },
      };
      const fetchMock = setupRun(() => jsonResponse(sent));
      const user = userEvent.setup();
      renderWithProviders(<CandidatesPage />, { route: "/candidates?job_id=5" });

      const bar = await screen.findByRole("region", { name: "AI interview invitations" });
      expect(bar).toHaveTextContent(
        "AI interview invitations go out automatically on 31 Oct 2026, 08:00 WIB to the top 10 applicants.",
      );
      expect(within(bar).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/jobs/5/edit");

      await user.click(within(bar).getByRole("button", { name: "Send now" }));
      const dialog = await screen.findByRole("dialog", { name: "Invite the top 10 eligible applicants now?" });
      expect(dialog).toHaveTextContent("Each gets an email with their AI interview link.");
      await user.click(within(dialog).getByRole("button", { name: "Send invitations" }));

      expect(await screen.findByText("8 applicants invited")).toBeInTheDocument();
      const runCalls = fetchMock.mock.calls.filter(([input, init]) => String(input).endsWith("/jobs/5/auto-invite/run") && init?.method === "POST");
      expect(runCalls).toHaveLength(1);
    });

    it("explains a missing approved template when sending now", async () => {
      setupRun(() =>
        jsonResponse({ error: { code: "no_approved_template", message: "This job has no approved interview template." } }, 409),
      );
      const user = userEvent.setup();
      renderWithProviders(<CandidatesPage />, { route: "/candidates?job_id=5" });

      const bar = await screen.findByRole("region", { name: "AI interview invitations" });
      await user.click(within(bar).getByRole("button", { name: "Send now" }));
      await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Send invitations" }));

      expect(await screen.findByText("Approve an interview template first")).toBeInTheDocument();
      expect(within(bar).getByRole("link", { name: "Interview templates" })).toHaveAttribute(
        "href",
        "/interviews/templates?job_id=5",
      );
      expect(within(bar).queryByRole("button", { name: "Send now" })).not.toBeInTheDocument();
    });

    it("shows sent and off states", async () => {
      setup(applications, [{ ...job, auto_invite: { ...scheduled, status: "sent", ran_at: "2026-10-31T08:00:05+07:00", invited_count: 8 } }]);
      const { unmount } = renderWithProviders(<CandidatesPage />, { route: "/candidates?job_id=5" });
      expect(await screen.findByRole("region", { name: "AI interview invitations" })).toHaveTextContent(
        "Invitations sent on 31 Oct 2026 · 8 applicants invited.",
      );
      unmount();

      setup(applications, [{ ...job, auto_invite: { ...scheduled, enabled: false, status: "disabled" } }]);
      renderWithProviders(<CandidatesPage />, { route: "/candidates?job_id=5" });
      const bar = await screen.findByRole("region", { name: "AI interview invitations" });
      expect(bar).toHaveTextContent("Automatic invitations are off.");
      expect(within(bar).getByRole("link", { name: "Settings" })).toBeInTheDocument();
    });
  });
});

describe("deleting from the applicants table", () => {
  const ayuTwoJobs = {
    id: 31,
    full_name: "Ayu Lestari",
    applications: [
      { id: 11, job_id: 5, job_title: "Data Scientist", stage: "screening", match_score: 82 },
      { id: 21, job_id: 6, job_title: "ML Engineer", stage: "applied", match_score: null },
    ],
    documents: [],
  };

  function setupDelete() {
    return mockFetch((url, init) => {
      const path = new URL(url, "http://localhost").pathname;
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (path.endsWith("/candidates/31")) return jsonResponse(ayuTwoJobs);
      if (path.endsWith("/applications")) return jsonResponse(page(applications));
      if (url.includes("/jobs")) return jsonResponse(page([job], 100));
      if (url.includes("/documents/")) return jsonResponse(processingDocument(14));
      return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
    });
  }

  function deleteCalls(fetchMock: ReturnType<typeof setupDelete>): string[] {
    return fetchMock.mock.calls
      .filter(([, init]) => init?.method === "DELETE")
      .map(([input]) => new URL(String(input), "http://localhost").pathname);
  }

  async function openDelete(user: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole("link", { name: "Ayu Lestari" });
    await user.click(screen.getByRole("button", { name: "Actions for Ayu Lestari" }));
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));
    return screen.findByRole("dialog");
  }

  it("deletes only the application by default from a job-filtered row", async () => {
    const fetchMock = setupDelete();
    const user = userEvent.setup();
    renderWithProviders(<CandidatesPage />, { route: "/candidates?job_id=5" });

    const dialog = await openDelete(user);
    expect(await within(dialog).findByRole("radio", { name: "Only this application (Data Scientist)" })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: "The whole candidate (all 2 applications)" })).not.toBeChecked();
    await user.click(within(dialog).getByRole("button", { name: "Delete application" }));

    await waitFor(() => expect(deleteCalls(fetchMock)).toEqual(["/api/v1/talent/applications/11"]));
    expect(await screen.findByText("Application deleted")).toBeInTheDocument();
  });

  it("can delete the whole candidate from a row", async () => {
    const fetchMock = setupDelete();
    const user = userEvent.setup();
    renderWithProviders(<CandidatesPage />, { route: "/candidates?job_id=5" });

    const dialog = await openDelete(user);
    await user.click(await within(dialog).findByRole("radio", { name: "The whole candidate (all 2 applications)" }));
    expect(within(dialog).getByRole("heading", { name: "Delete candidate?" })).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Ayu Lestari and all their data will be permanently deleted: 2 applications, CV files, screening results, AI interviews and evaluations. This can't be undone.",
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete candidate" }));

    await waitFor(() => expect(deleteCalls(fetchMock)).toEqual(["/api/v1/talent/candidates/31"]));
    expect(await screen.findByText("Candidate deleted")).toBeInTheDocument();
  });

  it("row clicks in the menu don't open the candidate", async () => {
    setupDelete();
    const user = userEvent.setup();
    renderWithProviders(<CandidatesPage />, { route: "/candidates" });

    await screen.findByRole("link", { name: "Ayu Lestari" });
    await user.click(screen.getByRole("button", { name: "Actions for Ayu Lestari" }));
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
    // Still on the list (the trigger click didn't navigate).
    expect(screen.getByRole("link", { name: "Ayu Lestari" })).toBeInTheDocument();
  });
});
