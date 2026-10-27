import { AlertTriangle, CheckCircle2, CircleMinus, MessageSquareText, Quote } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui";
import type { CompetencyEvaluation } from "@/types/api";
import { RubricScoreIndicator } from "./RubricScoreIndicator";

function EvidenceQuotes({
  evidence,
  onQuoteClick,
}: {
  evidence: CompetencyEvaluation["evidence"];
  onQuoteClick?: (messageId: number) => void;
}) {
  if (evidence.length === 0) {
    return <p className="text-sm text-slate-500">No quotes were cited for this competency.</p>;
  }
  return (
    <ul className="space-y-2">
      {evidence.map((item, index) => {
        const messageId = item.message_id;
        if (messageId !== null && onQuoteClick) {
          return (
            <li key={`${messageId}-${index}`}>
              <button
                type="button"
                onClick={() => onQuoteClick(messageId)}
                className="group block w-full rounded-r-lg border-l-4 border-indigo-200 bg-slate-50 px-4 py-2.5 text-left transition-colors hover:border-indigo-500 hover:bg-indigo-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
              >
                <span className="block text-sm italic leading-relaxed text-slate-700">“{item.quote}”</span>
                <span className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 group-hover:underline">
                  <MessageSquareText className="size-3.5" aria-hidden />
                  Show in transcript
                </span>
              </button>
            </li>
          );
        }
        return (
          <li key={`quote-${index}`}>
            <blockquote className="rounded-r-lg border-l-4 border-slate-200 bg-slate-50 px-4 py-2.5 text-sm italic leading-relaxed text-slate-700">
              “{item.quote}”
            </blockquote>
          </li>
        );
      })}
    </ul>
  );
}

function PointList({ items, kind }: { items: string[]; kind: "strength" | "gap" }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-400">None noted.</p>;
  }
  const Icon = kind === "strength" ? CheckCircle2 : CircleMinus;
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2 text-sm text-slate-700">
          <Icon
            className={kind === "strength" ? "mt-0.5 size-4 shrink-0 text-emerald-600" : "mt-0.5 size-4 shrink-0 text-amber-600"}
            aria-hidden
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export function CompetencyEvaluationCard({
  competency,
  onQuoteClick,
}: {
  competency: CompetencyEvaluation;
  onQuoteClick?: (messageId: number) => void;
}) {
  const insufficient = competency.insufficient_evidence || competency.score === null;
  // Evidence was collected but no automated score was produced (e.g. no LLM configured): HR scores it.
  const awaitingHrScore = !competency.insufficient_evidence && competency.score === null;
  return (
    <Card className={insufficient ? "border-amber-300" : undefined}>
      <CardHeader
        title={competency.competency}
        actions={
          !insufficient && competency.score !== null ? (
            <RubricScoreIndicator score={competency.score} />
          ) : (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/25">
              <AlertTriangle className="size-3.5" aria-hidden />
              Not scored
            </span>
          )
        }
      />
      <CardContent className="space-y-5">
        {awaitingHrScore ? (
          <div role="status" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold">Not scored automatically — HR scoring required</p>
              <p className="mt-0.5 opacity-90">
                Answer excerpts were collected below, but no automated rubric score was produced. Score this
                competency against the rubric and record your assessment in the reviewer notes.
              </p>
            </div>
          </div>
        ) : insufficient ? (
          <div role="status" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold">Insufficient evidence — HR review required</p>
              <p className="mt-0.5 opacity-90">
                The answers didn&apos;t contain enough evidence to score this competency against the rubric. Review the
                transcript and record your assessment in the reviewer notes.
              </p>
            </div>
          </div>
        ) : competency.rubric_level ? (
          <div className="rounded-lg bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Rubric level {competency.score}</p>
            <p className="mt-1 text-sm text-slate-800">{competency.rubric_level}</p>
          </div>
        ) : null}

        <section aria-label={`Evidence for ${competency.competency}`}>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Quote className="size-3.5" aria-hidden />
            Evidence from the answers
          </h4>
          <EvidenceQuotes evidence={competency.evidence} onQuoteClick={onQuoteClick} />
        </section>

        <div className="grid gap-5 sm:grid-cols-2">
          <section aria-label="Strengths">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Strengths</h4>
            <PointList items={competency.strengths} kind="strength" />
          </section>
          <section aria-label="Gaps">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Gaps</h4>
            <PointList items={competency.gaps} kind="gap" />
          </section>
        </div>
      </CardContent>
    </Card>
  );
}
