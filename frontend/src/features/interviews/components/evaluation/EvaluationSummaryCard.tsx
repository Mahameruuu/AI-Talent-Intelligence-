import { Cpu, Info } from "lucide-react";
import { Badge, Card, CardContent, ScoreRing, StatusBadge } from "@/components/ui";
import type { InterviewEvaluation } from "@/types/api";
import { formatDateTime } from "@/utils/format";
import { formatEvaluationMethod } from "../../interview-utils";

export const EVALUATION_DISCLAIMER =
  "AI-assisted assessment of interview answers against the approved rubric — not a hiring decision. Final decisions are made by HR.";

export function EvaluationSummaryCard({ evaluation }: { evaluation: InterviewEvaluation }) {
  const scoreMissing = evaluation.overall_score === null;
  return (
    <Card>
      <CardContent className="flex flex-col gap-6 py-5 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <ScoreRing score={evaluation.overall_score} size={112} label="Overall interview score" />
          <span className={scoreMissing ? "text-xs font-semibold text-amber-700" : "text-xs text-slate-500"}>
            {scoreMissing ? "Not computable" : "Weighted overall score"}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">Overall assessment</h2>
            <StatusBadge kind="evaluation" value={evaluation.status} />
            <Badge tone="neutral" title={`Method: ${evaluation.method}`}>
              <Cpu aria-hidden />
              {formatEvaluationMethod(evaluation.method)}
            </Badge>
          </div>
          {evaluation.overall_summary ? (
            <p className="text-sm leading-relaxed text-slate-700">{evaluation.overall_summary}</p>
          ) : (
            <p className="text-sm text-slate-500">No overall summary was produced for this evaluation.</p>
          )}
          {scoreMissing ? (
            <p className="text-sm text-amber-800">
              The overall score couldn&apos;t be computed from the available evidence. Review the competencies below.
            </p>
          ) : null}
          <p className="text-xs text-slate-500">Evaluated {formatDateTime(evaluation.created_at)}</p>
          <p className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            <Info className="mt-px size-3.5 shrink-0 text-slate-400" aria-hidden />
            {EVALUATION_DISCLAIMER}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
