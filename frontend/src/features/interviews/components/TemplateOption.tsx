import { useId } from "react";
import { Badge } from "@/components/ui";
import type { InterviewTemplate } from "@/types/api";
import { cn } from "@/utils/cn";
import { pluralize } from "@/utils/format";
import { INTERVIEW_LANGUAGE_LABELS } from "@/utils/labels";
import { totalQuestionsPerSession } from "../interview-utils";

export interface TemplateOptionProps {
  template: InterviewTemplate;
  selected: boolean;
  onSelect: () => void;
  /** Radio group name. */
  name: string;
}

/** Radio card for choosing an approved interview template (single and bulk invitations). */
export function TemplateOption({ template, selected, onSelect, name }: TemplateOptionProps) {
  const inputId = useId();
  const total = totalQuestionsPerSession(template);
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer gap-3 rounded-xl border px-4 py-3 transition-colors",
        selected ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500" : "border-slate-200 hover:bg-slate-50",
      )}
    >
      <input
        id={inputId}
        type="radio"
        name={name}
        checked={selected}
        onChange={onSelect}
        className="mt-1 size-4 shrink-0 accent-indigo-700"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-slate-900">{template.name}</span>
          <Badge tone="info" size="sm">
            {INTERVIEW_LANGUAGE_LABELS[template.language] ?? template.language}
          </Badge>
          {template.cv_questions > 0 ? (
            <Badge tone="violet" size="sm">
              {pluralize(template.cv_questions, "CV question")}
            </Badge>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">
          {pluralize(total, "question")} in total
          {template.cv_questions > 0
            ? ` (${template.cv_questions} personalised from the CV + ${template.num_questions} from the template)`
            : ""}{" "}
          · {pluralize(template.competencies.length, "competency", "competencies")} · ~{template.duration_minutes} min · link
          valid {template.invitation_expiry_hours} h
        </span>
        {template.approved_by ? (
          <span className="mt-0.5 block text-xs text-slate-400">Approved by {template.approved_by}</span>
        ) : null}
      </span>
    </label>
  );
}
