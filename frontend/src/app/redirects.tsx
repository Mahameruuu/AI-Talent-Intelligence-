import { Navigate, useLocation, useParams } from "react-router";

/** Old screening-results links (/cv-screening?job_id=…, /cv-screening/results) open the Candidates table for that job. */
export function LegacyScreeningRedirect({ formsByDefault }: { formsByDefault: boolean }) {
  const { search } = useLocation();
  const jobId = new URLSearchParams(search).get("job_id");
  if (formsByDefault && jobId === null) return <Navigate to="/jobs" replace />;
  return <Navigate to={jobId ? `/candidates?job_id=${encodeURIComponent(jobId)}` : "/candidates"} replace />;
}

export function LegacyFormBuilderRedirect() {
  const { jobId } = useParams();
  return <Navigate to={jobId ? `/jobs/${jobId}/form` : "/jobs"} replace />;
}

/** The job detail page was removed: a job opens straight into its application form. */
export function JobDetailRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/jobs/${id}/form` : "/jobs"} replace />;
}

/** The Analytics page was merged into the dashboard. */
export function AnalyticsRedirect() {
  return <Navigate to="/" replace />;
}
