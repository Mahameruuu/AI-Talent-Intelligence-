import { AlertTriangle, Check, CheckCircle2, ListChecks, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { useState } from "react";
import { Badge, Card, CardHeader, StatusBadge } from "@/components/ui";
import type { RequirementResult, RequirementStatus } from "@/types/api";
import { cn } from "@/utils/cn";
import { REQUIREMENT_CATEGORY_LABELS, REQUIREMENT_CATEGORY_ORDER } from "@/utils/labels";
import type { PendingValidations, ValidationDecision } from "../validation";
import { EvidenceQuotes } from "./EvidenceQuotes";

const STATUS_ICON: Record<RequirementStatus, { icon: typeof CheckCircle2; className: string }> = {
  matched: { icon: CheckCircle2, className: "text-emerald-600" },
  not_found: { icon: XCircle, className: "text-rose-600" },
  needs_review: { icon: AlertTriangle, className: "text-amber-500" },
};

const FILTERS: { value: RequirementStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "matched", label: "Matched" },
  { value: "not_found", label: "Not Found in CV" },
  { value: "needs_review", label: "Needs Review" },
];

export interface RequirementChecklistProps {
  requirements: RequirementResult[];
  pending: PendingValidations;
  onValidate: (key: string, decision: ValidationDecision | null) => void;
}

export function RequirementChecklist({ requirements, pending, onValidate }: RequirementChecklistProps) {
  const [filter, setFilter] = useState<RequirementStatus | "all">("all");
  const counts: Record<RequirementStatus, number> = { matched: 0, not_found: 0, needs_review: 0 };
  for (const item of requirements) counts[item.status] += 1;

  const visible = requirements.filter((item) => filter === "all" || item.status === filter);
  const groups = REQUIREMENT_CATEGORY_ORDER.map((category) => ({
    category,
    items: visible.filter((item) => item.category === category),
  })).filter((group) => group.items.length > 0);

  return (
    <Card>
      <CardHeader
        title="Requirement checklist"
        description="Each job requirement checked against the CV, and screening questions against the applicant's answers. Confirm or reject a finding to record your own check."
        icon={<ListChecks />}
      />
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3" role="group" aria-label="Filter requirements">
        {FILTERS.map((option) => {
          const count = option.value === "all" ? requirements.length : counts[option.value];
          const active = filter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                active ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {option.value !== "all" ? (
                (() => {
                  const Icon = STATUS_ICON[option.value].icon;
                  return <Icon className={cn("size-3.5", STATUS_ICON[option.value].className)} aria-hidden />;
                })()
              ) : null}
              {option.label}
              <span className="tabular-nums text-slate-400">{count}</span>
            </button>
          );
        })}
      </div>
      {groups.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">No requirements in this view.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {groups.map((group) => (
            <section key={group.category} aria-label={REQUIREMENT_CATEGORY_LABELS[group.category]}>
              <h4 className="bg-slate-50/80 px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {REQUIREMENT_CATEGORY_LABELS[group.category]} <span className="text-slate-400">({group.items.length})</span>
              </h4>
              <ul className="divide-y divide-slate-100">
                {group.items.map((item) => (
                  <RequirementRow key={item.key} item={item} pending={pending[item.key]} onValidate={onValidate} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

function RequirementRow({
  item,
  pending,
  onValidate,
}: {
  item: RequirementResult;
  pending: ValidationDecision | undefined;
  onValidate: (key: string, decision: ValidationDecision | null) => void;
}) {
  const { icon: Icon, className } = STATUS_ICON[item.status];
  // Screening questions compare the applicant's form answer with HR's expected answer (Met / Not met).
  const isScreening = item.category === "screening_question";
  const knockout = isScreening && item.knockout === true;
  const effective = pending ?? item.hr_validation;
  const choose = (decision: ValidationDecision) => {
    if (pending === decision) onValidate(item.key, null);
    else if (!pending && item.hr_validation === decision) return;
    else onValidate(item.key, decision);
  };
  return (
    <li className={cn("flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start", pending && "bg-indigo-50/40")}>
      <Icon className={cn("hidden size-5 shrink-0 lg:block", className)} aria-hidden />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{item.requirement}</p>
          {isScreening ? (
            <StatusBadge kind="screening" value={item.status} size="sm" />
          ) : (
            <StatusBadge kind="requirement" value={item.status} size="sm" />
          )}
          {knockout ? (
            <Badge size="sm" tone="warning" title="Must-meet qualification: flagged for HR, never rejected automatically">
              Knockout
            </Badge>
          ) : null}
        </div>
        {item.candidate_value ? (
          <p className="text-xs text-slate-600">
            <span className="text-slate-500">{isScreening ? "Answer: " : "In CV: "}</span>
            <span className="font-medium text-slate-800">{item.candidate_value}</span>
          </p>
        ) : null}
        <p className="text-xs leading-relaxed text-slate-500">{item.explanation}</p>
        <EvidenceQuotes evidence={item.evidence} className="pt-1" />
      </div>
      <div className="flex shrink-0 flex-col items-start gap-1.5 lg:items-end">
        <div className="flex gap-1.5" role="group" aria-label={`HR validation for ${item.requirement}`}>
          <button
            type="button"
            onClick={() => choose("confirmed")}
            aria-pressed={effective === "confirmed"}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
              effective === "confirmed"
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700",
            )}
          >
            <ThumbsUp className="size-3.5" aria-hidden />
            Confirm
          </button>
          <button
            type="button"
            onClick={() => choose("rejected")}
            aria-pressed={effective === "rejected"}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors",
              effective === "rejected"
                ? "border-rose-300 bg-rose-50 text-rose-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-rose-300 hover:text-rose-700",
            )}
          >
            <ThumbsDown className="size-3.5" aria-hidden />
            Reject
          </button>
        </div>
        {pending ? (
          <span className="text-[11px] font-medium text-indigo-700">Unsaved — {pending === "confirmed" ? "confirm" : "reject"}</span>
        ) : item.hr_validation ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <Check className="size-3" aria-hidden />
            HR {item.hr_validation}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">Not validated</span>
        )}
      </div>
    </li>
  );
}
