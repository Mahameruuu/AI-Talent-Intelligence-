import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, ScoreBar } from "@/components/ui";
import type { ComponentScore } from "@/types/api";
import { WEIGHT_LABELS } from "@/utils/labels";

/** Share (in %) each scored part contributes to the overall score; weights may arrive as fractions or percentages. */
function weightShares(components: ComponentScore[]): Map<ComponentScore["component"], number> {
  const total = components.reduce((sum, item) => sum + (item.score === null ? 0 : item.effective_weight), 0);
  const isFraction = total > 0 && total <= 1.01;
  return new Map(
    components.map((item) => [item.component, isFraction ? item.effective_weight * 100 : item.effective_weight]),
  );
}

/** How the overall match score is built up: one bar per part, with its share of the total. */
export function ScoreBreakdown({ components }: { components: ComponentScore[] }) {
  const shares = weightShares(components);
  return (
    <Card>
      <CardHeader
        title="Score breakdown"
        description="Each part is scored 0–100. The overall score combines them by their share."
        icon={<Gauge />}
      />
      <CardContent>
        {components.length === 0 ? (
          <p className="text-sm text-slate-500">No breakdown available for this screening.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {components.map((item) => {
              const label = WEIGHT_LABELS[item.component] ?? item.component;
              return (
                <li key={item.component} className="space-y-2 py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm font-medium text-slate-900">{label}</p>
                    <p className="text-xs tabular-nums text-slate-500">
                      {item.score === null ? "Not counted" : `${Math.round(shares.get(item.component) ?? 0)}% of overall score`}
                    </p>
                  </div>
                  <ScoreBar score={item.score} label={`${label} score`} />
                  <p className="text-xs leading-relaxed text-slate-500">
                    {item.score === null ? (
                      <span className="font-medium text-slate-600">Not enough information — left out of the overall score. </span>
                    ) : null}
                    {item.explanation}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
