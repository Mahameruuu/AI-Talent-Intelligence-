import type { Application, ApplicationStage, RequirementResult, ScreeningListItem } from "@/types/api";

export function makeApplication(id: number, overrides: Partial<Application> = {}): Application {
  return {
    id,
    candidate_id: id + 100,
    candidate_name: `Candidate ${id}`,
    job_id: 5,
    job_title: "Data Scientist",
    stage: "screening",
    match_score: null,
    latest_document: null,
    latest_screening_id: null,
    candidate_email: null,
  screening_summary: null,
    stage_history: [],
    source: "public_form",
    form_answers: [],
    submitted_at: "2026-10-03T08:00:00Z",
    decision: null,
    decision_note: null,
    decided_at: null,
    decided_by: null,
    has_completed_interview: false,
    is_demo: false,
    created_at: "2026-10-03T08:00:00Z",
    ...overrides,
  };
}

const requirementBase: Omit<RequirementResult, "key" | "category" | "status"> = {
  requirement: "",
  matched_by: null,
  candidate_value: null,
  explanation: "",
  evidence: [],
  hr_validation: null,
};

export function makeScreening(
  applicationId: number,
  score: number | null,
  overrides: Partial<ScreeningListItem> & { stage?: ApplicationStage } = {},
): ScreeningListItem {
  return {
    id: applicationId + 1000,
    application_id: applicationId,
    document_id: applicationId + 2000,
    status: "completed",
    overall_score: score,
    components: [],
    requirements: [
      { ...requirementBase, key: "r1", category: "required_skill", status: "matched" },
      { ...requirementBase, key: "r2", category: "required_skill", status: "not_found" },
    ],
    experience_summary: "",
    flags: [],
    pipeline_version: "1",
    methods: {},
    created_at: "2026-10-20T10:00:00Z",
    reviews: [],
    candidate_id: applicationId + 100,
    candidate_name: `Candidate ${applicationId}`,
    job_id: 5,
    job_title: "Data Scientist",
    stage: "screening",
    ...overrides,
  };
}
