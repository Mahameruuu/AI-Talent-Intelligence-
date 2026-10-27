import { ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, Chip } from "@/components/ui";
import type { Application, FormAnswer } from "@/types/api";
import { formatDate, formatDateTime, formatNumber } from "@/utils/format";

function isSafeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/** Human-readable value for one submitted answer. */
export function AnswerValueView({ answer }: { answer: FormAnswer }) {
  const { value, type } = answer;
  const empty = <span className="text-slate-400">No answer</span>;
  if (value === null || value === "" || (Array.isArray(value) && value.length === 0)) return empty;

  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {value.map((item) => (
          <Chip key={item}>{item}</Chip>
        ))}
      </span>
    );
  }
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "number") return <>{formatNumber(value)}</>;
  if (type === "yes_no") return <>{value === "yes" ? "Yes" : value === "no" ? "No" : value}</>;
  if (type === "date") return <>{formatDate(value, value)}</>;
  if (type === "url" && isSafeUrl(value)) {
    return (
      <a href={value} target="_blank" rel="noopener noreferrer" className="break-all text-indigo-700 hover:underline">
        {value}
      </a>
    );
  }
  if (type === "email") {
    return (
      <a href={`mailto:${value}`} className="break-all text-indigo-700 hover:underline">
        {value}
      </a>
    );
  }
  return <span className="whitespace-pre-line break-words">{value}</span>;
}

/** Answers to the job's custom application-form questions for the selected application. */
export function FormAnswersCard({ application }: { application: Application }) {
  const answers = application.form_answers ?? [];
  if (answers.length === 0) return null;
  return (
    <Card>
      <CardHeader
        icon={<ClipboardList />}
        title="Application form answers"
        description={
          application.submitted_at
            ? `Submitted ${formatDateTime(application.submitted_at)} · labels as shown to the applicant`
            : "Labels as shown to the applicant"
        }
      />
      <CardContent className="py-1">
        <dl className="divide-y divide-slate-100">
          {answers.map((answer) => (
            <div key={answer.field_id} className="grid gap-1 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
              <dt className="text-sm text-slate-500">{answer.label}</dt>
              <dd className="text-sm font-medium text-slate-900">
                <AnswerValueView answer={answer} />
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
