import { lazy, Suspense, type ComponentType } from "react";
import { Navigate, type RouteObject } from "react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { NotFoundPage } from "./NotFoundPage";
import { AnalyticsRedirect, JobDetailRedirect, LegacyFormBuilderRedirect, LegacyScreeningRedirect } from "./redirects";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

/** Code-split a named page export. */
function lazyPage<M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M & string) {
  return lazy(async () => {
    const module = await loader();
    return { default: module[name] as ComponentType };
  });
}

const DashboardPage = lazyPage(() => import("@/features/dashboard/DashboardPage"), "DashboardPage");
const JobListPage = lazyPage(() => import("@/features/jobs/JobListPage"), "JobListPage");
const JobFormPage = lazyPage(() => import("@/features/jobs/JobFormPage"), "JobFormPage");
const CandidatesPage = lazyPage(() => import("@/features/candidates/CandidatesPage"), "CandidatesPage");
const CandidateDetailPage = lazyPage(() => import("@/features/candidates/CandidateDetailPage"), "CandidateDetailPage");
const FormBuilderPage = lazyPage(() => import("@/features/application-forms/FormBuilderPage"), "FormBuilderPage");
const InterviewListPage = lazyPage(() => import("@/features/interviews/InterviewListPage"), "InterviewListPage");
const InterviewDetailPage = lazyPage(() => import("@/features/interviews/InterviewDetailPage"), "InterviewDetailPage");
const EvaluationPage = lazyPage(() => import("@/features/interviews/EvaluationPage"), "EvaluationPage");
const EmailLogPage = lazyPage(() => import("@/features/interviews/EmailLogPage"), "EmailLogPage");
const TemplateListPage = lazyPage(() => import("@/features/interviews/TemplateListPage"), "TemplateListPage");
const TemplateEditorPage = lazyPage(() => import("@/features/interviews/TemplateEditorPage"), "TemplateEditorPage");
const SettingsPage = lazyPage(() => import("@/features/settings/SettingsPage"), "SettingsPage");
const PublicApplyPage = lazyPage(() => import("@/features/public-apply/PublicApplyPage"), "PublicApplyPage");
const CandidateInterviewPage = lazyPage(
  () => import("@/features/candidate-interview/CandidateInterviewPage"),
  "CandidateInterviewPage",
);

export const routes: RouteObject[] = [
  // There is no login (sign-in is handled by the central system): old /login links go to the dashboard.
  { path: "/login", element: <Navigate to="/" replace /> },
  {
    // Public candidate-facing page (invitation token), no HR layout.
    path: "/interview",
    element: (
      <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
        <CandidateInterviewPage />
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    // Public application form, no HR layout.
    path: "/apply/:slug",
    element: (
      <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
        <PublicApplyPage />
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "jobs", element: <JobListPage /> },
      { path: "jobs/forms", element: <Navigate to="/jobs" replace /> },
      { path: "jobs/new", element: <JobFormPage /> },
      { path: "jobs/:id", element: <JobDetailRedirect /> },
      { path: "jobs/:id/edit", element: <JobFormPage /> },
      { path: "jobs/:id/form", element: <FormBuilderPage /> },
      { path: "candidates", element: <CandidatesPage /> },
      { path: "candidates/:id", element: <CandidateDetailPage /> },
      // Legacy "CV Screening" section: merged into Candidates (results) and Jobs (application forms).
      { path: "cv-screening", element: <LegacyScreeningRedirect formsByDefault /> },
      { path: "cv-screening/results", element: <LegacyScreeningRedirect formsByDefault={false} /> },
      { path: "cv-screening/forms/:jobId", element: <LegacyFormBuilderRedirect /> },
      { path: "cv-screening/upload", element: <Navigate to="/jobs" replace /> },
      { path: "interviews", element: <InterviewListPage /> },
      { path: "interviews/templates", element: <TemplateListPage /> },
      { path: "interviews/emails", element: <EmailLogPage /> },
      { path: "interviews/templates/new", element: <TemplateEditorPage /> },
      { path: "interviews/templates/:id", element: <TemplateEditorPage /> },
      { path: "interviews/:id", element: <InterviewDetailPage /> },
      { path: "interviews/:id/evaluation", element: <EvaluationPage /> },
      { path: "analytics", element: <AnalyticsRedirect /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
