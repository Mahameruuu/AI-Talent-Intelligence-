import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { makeApplication } from "@/features/shortlist/test-fixtures";
import { jsonResponse, mockFetch, renderWithProviders } from "@/test/utils";
import type { Candidate, DocumentDetail, DocumentInfo, ExtractedField, ScreeningResult } from "@/types/api";
import { CandidateDetailPage } from "./CandidateDetailPage";

const evidence = [{ text: "Built churn models in Python and SQL", section: "experience", line: 25 }];

const documentInfo: DocumentInfo = {
  id: 21,
  application_id: 11,
  candidate_id: 31,
  filename: "ayu-cv.pdf",
  mime_type: "application/pdf",
  size_bytes: 120_000,
  status: "completed",
  error_code: null,
  error_message: null,
  page_count: 2,
  ocr_used: false,
  pipeline_version: "cv-pipeline-2.3",
  steps: [{ name: "skills", status: "ok", duration_ms: 12, detail: "taxonomy" }],
  processing_ms: 900,
  created_at: "2026-10-20T10:00:00Z",
  processed_at: "2026-10-20T10:00:05Z",
};

function field(value: string | null): ExtractedField {
  return { value, evidence, method: "rule:header", confidence: "high" };
}

const documentDetail: DocumentDetail = {
  ...documentInfo,
  clean_text: "Line 1\nBuilt churn models in Python and SQL",
  sections: [],
  methods: { ner: "rule-based", skills: "taxonomy-v1", embeddings: "tfidf-lexical", llm: "disabled" },
  extraction: {
    name: field("Ayu Lestari"),
    email: field("ayu@example.com"),
    phone: field(null),
    location: field(null),
    summary: field("Data scientist"),
    skills: [
      { original: "sklearn", normalized: "scikit-learn", category: "ml_library", in_taxonomy: true, method: "alias", evidence },
    ],
    experience: [],
    education: [],
    certifications: [],
    languages: [field("English"), field("Bahasa Indonesia")],
    total_experience_months: 50,
    experience_calculation_note: "Summed non-overlapping ranges",
    sections_detected: ["experience"],
  },
};

const application = makeApplication(11, {
  candidate_id: 31,
  candidate_name: "Ayu Lestari",
  match_score: 82,
  latest_document: documentInfo,
  latest_screening_id: 41,
});

const candidate: Candidate = {
  id: 31,
  full_name: "Ayu Lestari",
  email: "ayu@example.com",
  phone: "+62 812 0000 0000",
  location: null,
  top_skills: ["Python"],
  latest_document_status: "completed",
  best_match_score: 82,
  applications: [{ id: 11, job_id: 5, job_title: "Data Scientist", stage: "screening", match_score: 82 }],
  is_demo: false,
  created_at: "2026-10-20T10:00:00Z",
  skills: [
    { name: "Python", source: "ai" },
    { name: "scikit-learn", source: "ai" },
  ],
  education: [],
  experience: [
    {
      title: "Data Analyst",
      company: "PT Maju",
      start: "2021-03",
      end: "present",
      is_current: true,
      duration_months: 50,
      description: null,
      evidence,
    },
  ],
  total_experience_months: 50,
  corrections: {},
  documents: [documentInfo],
};

const screening: ScreeningResult = {
  id: 41,
  application_id: 11,
  document_id: 21,
  status: "completed",
  overall_score: 82,
  components: [
    { component: "required_skills", score: 80, weight: 35, effective_weight: 0.5, explanation: "4 of 5 required skills found." },
    {
      component: "screening_questions",
      score: 50,
      weight: 15,
      effective_weight: 0.5,
      explanation: "1 of 2 screening questions answered as expected.",
    },
  ],
  requirements: [
    {
      key: "required_skill:python",
      category: "required_skill",
      requirement: "Python",
      status: "matched",
      matched_by: "exact",
      candidate_value: "Python",
      explanation: "Python appears in the experience section.",
      evidence,
      hr_validation: null,
    },
    {
      key: "screening_question:f_relocate",
      category: "screening_question",
      requirement: "Willing to relocate?",
      status: "matched",
      matched_by: "computed",
      candidate_value: "Yes",
      explanation: "Answered “Yes”; expected Yes.",
      evidence: [],
      hr_validation: null,
    },
    {
      key: "screening_question:f_sponsor",
      category: "screening_question",
      requirement: "Do you need visa sponsorship?",
      status: "not_found",
      matched_by: "computed",
      candidate_value: "Yes",
      explanation: "Answered “Yes”; expected No.",
      evidence: [],
      hr_validation: null,
      knockout: true,
    },
  ],
  experience_summary: "About 4 years of data analysis experience, mostly in Python and SQL.",
  flags: [{ code: "knockout_unmet", severity: "warning", message: "A must-meet screening question was not met." }],
  pipeline_version: "cv-pipeline-2.3",
  methods: { ner: "rule-based", embeddings: "tfidf-lexical" },
  created_at: "2026-10-20T10:01:00Z",
  reviews: [],
};

function setup() {
  return mockFetch((url, init) => {
    const path = new URL(url, "http://localhost").pathname;
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (path.endsWith("/candidates/31")) return jsonResponse(candidate);
    if (path.endsWith("/applications/11/screening")) return jsonResponse(screening);
    if (path.endsWith("/applications/11/reviews")) return jsonResponse([]);
    if (path.endsWith("/applications/11")) return jsonResponse(application);
    if (path.endsWith("/documents/21")) return jsonResponse(documentDetail);
    if (path.endsWith("/interviews")) return jsonResponse({ items: [], total: 0, page: 1, page_size: 100 });
    if (path.endsWith("/interview-templates")) return jsonResponse([]);
    return jsonResponse({ error: { code: "not_found", message: "Not found" } }, 404);
  });
}

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/candidates/:id" element={<CandidateDetailPage />} />
      <Route path="/candidates" element={<p>Candidates list</p>} />
    </Routes>,
    { route: "/candidates/31?application=11" },
  );
}

describe("CandidateDetailPage", () => {
  it("shows the whole screening result on one page", async () => {
    setup();
    renderDetail();

    expect(await screen.findByText(screening.experience_summary)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ayu Lestari" })).toBeInTheDocument();
    expect(screen.getAllByText("Strong match").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Match with job criteria — not a prediction of job success. Final decisions are made by HR.").length,
    ).toBeGreaterThan(0);

    // Score breakdown with plain explanations and shares.
    expect(screen.getByText("Score breakdown")).toBeInTheDocument();
    expect(screen.getByText("4 of 5 required skills found.")).toBeInTheDocument();
    expect(screen.getAllByText("50% of overall score")).toHaveLength(2);

    // Requirement checklist incl. screening questions (Met / Not met) and quoted CV evidence.
    const questions = await screen.findByRole("region", { name: "Screening questions" });
    expect(within(questions).getByText("Willing to relocate?")).toBeInTheDocument();
    expect(within(questions).getByText("Met")).toBeInTheDocument();
    expect(within(questions).getByText("Not met")).toBeInTheDocument();
    expect(within(questions).getByText("Knockout")).toBeInTheDocument();
    expect(within(questions).getAllByText("Answer:", { exact: false })).toHaveLength(2);
    const skills = screen.getByRole("region", { name: "Required skills" });
    expect(within(skills).getByText("“Built churn models in Python and SQL”")).toBeInTheDocument();
    expect(within(skills).getByRole("button", { name: /confirm/i })).toBeInTheDocument();

    // Stage history and profile are sections of the same page; flags, HR review and interviews are not shown.
    expect(screen.queryByText("A must-meet screening question was not met.")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stage history" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stage history/i })).not.toBeInTheDocument();
    expect(screen.getByText("Data Analyst")).toBeInTheDocument();
    expect(await screen.findByText("Bahasa Indonesia")).toBeInTheDocument();
    expect(screen.getAllByText("Not found in CV").length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "HR review" })).not.toBeInTheDocument();
    expect(screen.queryByText("AI interviews")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /invite to ai interview/i })).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("never shows method information", async () => {
    setup();
    renderDetail();

    await screen.findByText(screening.experience_summary);
    await screen.findByText("Bahasa Indonesia");

    const text = document.body.textContent ?? "";
    for (const hidden of [
      "Pipeline",
      "cv-pipeline-2.3",
      "NLP Processing",
      "Evidence Viewer",
      "Exact match",
      "Computed",
      "Normalized",
      "rule:",
      "rule-based",
      "tfidf",
      "confidence",
      "L25",
      "Reprocess",
      "knockout_unmet",
    ]) {
      expect(text).not.toContain(hidden);
    }
    expect(screen.queryByTitle("Show in CV text")).not.toBeInTheDocument();
  });

  it("deletes the candidate from the header menu and returns to the list", async () => {
    const fetchMock = setup();
    const user = userEvent.setup();
    renderDetail();

    await screen.findByText(screening.experience_summary);
    await user.click(screen.getByRole("button", { name: "More actions for Ayu Lestari" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete candidate" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Delete candidate?" })).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Ayu Lestari and all their data will be permanently deleted: 1 application, CV files, screening results, AI interviews and evaluations. This can't be undone.",
      ),
    ).toBeInTheDocument();
    // One application only: no choice to make.
    expect(within(dialog).queryByRole("radio")).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete candidate" }));

    expect(await screen.findByText("Candidates list")).toBeInTheDocument();
    expect(screen.getByText("Candidate deleted")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) => init?.method === "DELETE" && String(input).endsWith("/candidates/31"),
        ),
      ).toBe(true),
    );
  });
});
