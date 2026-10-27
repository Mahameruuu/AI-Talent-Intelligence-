import type { ApplicationListParams, CandidateListParams } from "./candidates-api";
import type { EmailLogParams } from "./email-logs-api";
import type { InterviewListParams } from "./interviews-api";
import type { JobApplicationsParams, JobListParams } from "./jobs-api";
import type { ScreeningListParams } from "./screening-api";

/** Centralised TanStack Query keys so invalidation stays consistent. */
export const queryKeys = {
  me: ["auth", "me"] as const,
  jobs: {
    all: ["jobs"] as const,
    list: (params: JobListParams) => ["jobs", "list", params] as const,
    detail: (id: number) => ["jobs", "detail", id] as const,
    applications: (id: number, params: JobApplicationsParams) => ["jobs", "detail", id, "applications", params] as const,
  },
  candidates: {
    all: ["candidates"] as const,
    list: (params: CandidateListParams) => ["candidates", "list", params] as const,
    detail: (id: number) => ["candidates", "detail", id] as const,
  },
  applications: {
    all: ["applications"] as const,
    lists: ["applications", "list"] as const,
    list: (params: ApplicationListParams) => ["applications", "list", params] as const,
    detail: (id: number) => ["applications", "detail", id] as const,
    screening: (id: number) => ["applications", "detail", id, "screening"] as const,
    reviews: (id: number) => ["applications", "detail", id, "reviews"] as const,
  },
  documents: {
    all: ["documents"] as const,
    status: (id: number) => ["documents", id, "status"] as const,
    detail: (id: number) => ["documents", id, "detail"] as const,
  },
  screenings: {
    all: ["screenings"] as const,
    list: (params: ScreeningListParams) => ["screenings", "list", params] as const,
  },
  forms: {
    all: ["application-forms"] as const,
    list: ["application-forms", "list"] as const,
    byJob: (jobId: number) => ["application-forms", "job", jobId] as const,
  },
  /** Public (no login) application form by slug. */
  publicForm: (slug: string) => ["public-form", slug] as const,
  templates: {
    all: ["interview-templates"] as const,
    list: (params: { job_id?: number }) => ["interview-templates", "list", params] as const,
    detail: (id: number) => ["interview-templates", "detail", id] as const,
  },
  interviews: {
    all: ["interviews"] as const,
    list: (params: InterviewListParams) => ["interviews", "list", params] as const,
    detail: (id: number) => ["interviews", "detail", id] as const,
    evaluation: (id: number) => ["interviews", "detail", id, "evaluation"] as const,
  },
  emailLogs: {
    all: ["email-logs"] as const,
    list: (params: EmailLogParams) => ["email-logs", "list", params] as const,
  },
  analytics: {
    all: ["analytics"] as const,
    dashboard: ["analytics", "dashboard"] as const,
  },
  system: {
    status: ["system", "status"] as const,
    scoringWeights: ["settings", "scoring-weights"] as const,
    dataRetention: ["settings", "data-retention"] as const,
  },
} as const;
