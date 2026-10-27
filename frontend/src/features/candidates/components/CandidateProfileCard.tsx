import { CalendarRange, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Card, CardContent, CardHeader, Chip, NotFoundInCv, SkeletonText } from "@/components/ui";
import type { Candidate, CVExtraction, EducationEntry, ExperienceEntry, ExtractedField } from "@/types/api";
import { formatMonths } from "@/utils/format";
import { EDUCATION_LABELS } from "@/utils/labels";
import { formatYearMonth } from "./profile-format";

function ProfileSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5 py-4 first:pt-0 last:pb-0" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function fieldValues(fields: ExtractedField[] | undefined): string[] {
  return (fields ?? []).map((field) => field.value).filter((value): value is string => Boolean(value && value.trim()));
}

function ChipList({ values }: { values: string[] }) {
  if (values.length === 0) return <NotFoundInCv />;
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <Chip key={value}>{value}</Chip>
      ))}
    </div>
  );
}

export interface CandidateProfileCardProps {
  candidate: Candidate;
  /** CV extraction for languages and certifications; undefined while loading or when there's no processed CV. */
  extraction: CVExtraction | null | undefined;
  extractionLoading: boolean;
}

/** What the CV says about the candidate (with HR corrections applied). Missing values stay empty. */
export function CandidateProfileCard({ candidate, extraction, extractionLoading }: CandidateProfileCardProps) {
  const experienceCorrected =
    candidate.corrections.total_experience_months !== null && candidate.corrections.total_experience_months !== undefined;
  const skills = [...new Set(candidate.skills.map((skill) => skill.name))];

  return (
    <Card>
      <CardHeader title="Candidate profile" description="From the CV, with HR corrections applied." icon={<UserRound />} />
      <CardContent className="divide-y divide-slate-100">
        <ProfileSection
          title="Experience"
          aside={
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              Total:{" "}
              {candidate.total_experience_months === null ? (
                <NotFoundInCv className="text-xs" />
              ) : (
                <span className="font-semibold text-slate-800">{formatMonths(candidate.total_experience_months)}</span>
              )}
              {experienceCorrected ? (
                <Badge tone="primary" size="sm">
                  HR corrected
                </Badge>
              ) : null}
            </span>
          }
        >
          {candidate.experience.length === 0 ? (
            <NotFoundInCv />
          ) : (
            <ol className="relative space-y-4 border-l border-slate-200 pl-5">
              {candidate.experience.map((entry, index) => (
                <ExperienceItem key={index} entry={entry} />
              ))}
            </ol>
          )}
        </ProfileSection>

        <ProfileSection title="Education">
          {candidate.education.length === 0 ? (
            <NotFoundInCv />
          ) : (
            <ul className="space-y-3">
              {candidate.education.map((entry, index) => (
                <EducationItem key={index} entry={entry} />
              ))}
            </ul>
          )}
        </ProfileSection>

        <ProfileSection title="Skills">
          <ChipList values={skills} />
        </ProfileSection>

        <ProfileSection title="Languages">
          {extractionLoading ? <SkeletonText lines={1} /> : <ChipList values={fieldValues(extraction?.languages)} />}
        </ProfileSection>

        <ProfileSection title="Certifications">
          {extractionLoading ? <SkeletonText lines={1} /> : <ChipList values={fieldValues(extraction?.certifications)} />}
        </ProfileSection>
      </CardContent>
    </Card>
  );
}

function ExperienceItem({ entry }: { entry: ExperienceEntry }) {
  const start = formatYearMonth(entry.start);
  const end = entry.is_current ? "Present" : formatYearMonth(entry.end);
  return (
    <li className="relative">
      <span
        className={`absolute -left-[1.6rem] top-1 size-2.5 rounded-full ring-4 ring-white ${entry.is_current ? "bg-indigo-600" : "bg-slate-300"}`}
        aria-hidden
      />
      <p className="text-sm font-semibold text-slate-900">{entry.title ?? <NotFoundInCv label="Title not found in CV" />}</p>
      <p className="text-sm text-slate-600">{entry.company ?? <NotFoundInCv label="Company not found in CV" />}</p>
      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <CalendarRange className="size-3.5" aria-hidden />
        {start ?? <NotFoundInCv className="text-xs" label="Start not found" />} – {end ?? <NotFoundInCv className="text-xs" label="End not found" />}
        {entry.duration_months !== null ? <span>· {formatMonths(entry.duration_months)}</span> : null}
      </p>
      {entry.description ? (
        <p className="mt-1.5 line-clamp-4 whitespace-pre-line text-xs leading-relaxed text-slate-600">{entry.description}</p>
      ) : null}
    </li>
  );
}

function EducationItem({ entry }: { entry: EducationEntry }) {
  const years =
    entry.start_year === null && entry.end_year === null ? null : `${entry.start_year ?? "?"} – ${entry.end_year ?? "?"}`;
  const title = entry.degree ?? (entry.level ? EDUCATION_LABELS[entry.level] : null);
  return (
    <li className="space-y-0.5">
      <p className="text-sm font-semibold text-slate-900">
        {title ?? <NotFoundInCv label="Degree not found in CV" />}
        {entry.field ? <span className="font-normal text-slate-600"> · {entry.field}</span> : null}
      </p>
      <p className="text-sm text-slate-600">{entry.institution ?? <NotFoundInCv label="Institution not found in CV" />}</p>
      <p className="text-xs text-slate-500">
        {years ?? <NotFoundInCv className="text-xs" label="Years not found in CV" />}
        {entry.gpa ? <span> · GPA {entry.gpa}</span> : null}
      </p>
    </li>
  );
}
