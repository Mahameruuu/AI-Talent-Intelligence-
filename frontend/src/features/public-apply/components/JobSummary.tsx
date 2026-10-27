import { Banknote, Briefcase, CalendarClock, Clock, MapPin, Building2 } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Chip } from "@/components/ui";
import type { PublicApplicationForm } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDateTime, formatDayTime, formatSalaryRange } from "@/utils/format";
import { EMPLOYMENT_TYPE_LABELS } from "@/utils/labels";

/** Descriptions longer than this are collapsed behind "Show more". */
const COLLAPSE_AFTER_CHARS = 360;

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
      <span className="text-slate-400 [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      {children}
    </span>
  );
}

function SkillList({ title, skills, primary }: { title: string; skills: string[]; primary?: boolean }) {
  if (skills.length === 0) return null;
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <li key={skill}>
            <Chip className={cn("text-[13px]", primary && "border-indigo-200 bg-indigo-50 text-indigo-800")}>
              {skill}
            </Chip>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Job header on the public apply page: title, meta, description ("Show more") and key skills. */
export function JobSummary({ form }: { form: PublicApplicationForm }) {
  const { job } = form;
  const [expanded, setExpanded] = useState(false);
  const descriptionId = useId();
  const description = job.description.trim();
  const collapsible = description.length > COLLAPSE_AFTER_CHARS;
  // The backend only sends the salary when HR chose to show it.
  const salary = formatSalaryRange(job.salary_min, job.salary_max);

  return (
    <section aria-labelledby="job-title" className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <p className="text-sm font-medium text-indigo-700">{form.company_name} is hiring</p>
      <h1 id="job-title" className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {job.title}
      </h1>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {job.department ? <Meta icon={<Building2 />}>{job.department}</Meta> : null}
        {job.location ? <Meta icon={<MapPin />}>{job.location}</Meta> : null}
        <Meta icon={<Clock />}>{EMPLOYMENT_TYPE_LABELS[job.employment_type] ?? EMPLOYMENT_TYPE_LABELS.full_time}</Meta>
        {salary ? <Meta icon={<Banknote />}>{salary}</Meta> : null}
        {job.min_experience_years ? (
          <Meta icon={<Briefcase />}>
            {job.min_experience_years}+ {job.min_experience_years === 1 ? "year" : "years"} of experience
          </Meta>
        ) : null}
        {job.closes_on ? (
          <Meta icon={<CalendarClock />}>Apply by {formatDayTime(job.closes_on, job.closes_time, { suffix: " WIB" })}</Meta>
        ) : form.closes_at ? (
          <Meta icon={<CalendarClock />}>Apply by {formatDateTime(form.closes_at)}</Meta>
        ) : null}
      </div>

      {description ? (
        <div className="mt-5">
          <h2 className="sr-only">About the role</h2>
          <p
            id={descriptionId}
            className={cn(
              "whitespace-pre-line text-[15px] leading-relaxed text-slate-700",
              collapsible && !expanded && "line-clamp-5",
            )}
          >
            {description}
          </p>
          {collapsible ? (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={descriptionId}
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 text-sm font-semibold text-indigo-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          ) : null}
        </div>
      ) : null}

      {job.required_skills.length > 0 || job.preferred_skills.length > 0 ? (
        <div className="mt-5 space-y-4 border-t border-slate-100 pt-5">
          <SkillList title="Key skills" skills={job.required_skills} primary />
          <SkillList title="Nice to have" skills={job.preferred_skills} />
        </div>
      ) : null}
    </section>
  );
}
