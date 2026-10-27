import { Select, type SelectProps } from "@/components/ui";
import { useJobOptions } from "@/hooks/queries/jobs";
import type { JobStatus } from "@/types/api";

export interface JobSelectProps extends Omit<SelectProps, "value" | "onChange" | "options"> {
  value: number | undefined;
  onValueChange: (jobId: number | undefined) => void;
  /** Label of the empty option, e.g. "All jobs". Pass null to force a choice. */
  emptyLabel?: string | null;
  /** Only list jobs with these statuses (default: all). */
  statuses?: JobStatus[];
}

/** Job picker backed by GET /jobs (first 100). Used by filters and upload forms. */
export function JobSelect({ value, onValueChange, emptyLabel = "All jobs", statuses, disabled, ...props }: JobSelectProps) {
  const jobsQuery = useJobOptions();
  const jobs = (jobsQuery.data?.items ?? []).filter((job) => !statuses || statuses.includes(job.status));
  const loading = jobsQuery.isPending;
  return (
    <Select
      value={value === undefined ? "" : String(value)}
      onChange={(event) => onValueChange(event.target.value ? Number(event.target.value) : undefined)}
      disabled={disabled || loading}
      {...props}
    >
      {emptyLabel !== null ? <option value="">{loading ? "Loading jobs…" : emptyLabel}</option> : null}
      {emptyLabel === null && value === undefined ? (
        <option value="" disabled>
          {loading ? "Loading jobs…" : jobs.length === 0 ? "No jobs available" : "Select a job"}
        </option>
      ) : null}
      {jobs.map((job) => (
        <option key={job.id} value={job.id}>
          {job.title}
          {job.status !== "open" ? ` (${job.status})` : ""}
        </option>
      ))}
    </Select>
  );
}
