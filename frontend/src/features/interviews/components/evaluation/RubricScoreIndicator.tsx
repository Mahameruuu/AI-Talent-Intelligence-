import { cn } from "@/utils/cn";
import { scoreTone, type ScoreTone } from "@/utils/score";

const RUBRIC_LEVELS = [1, 2, 3, 4, 5] as const;

const segmentTone: Record<ScoreTone, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-rose-500",
  none: "bg-slate-300",
};

/** 5-segment rubric score (1..5). Colour bands match the 0..100 score scale (score × 20). */
export function RubricScoreIndicator({ score, className }: { score: number; className?: string }) {
  const clamped = Math.max(0, Math.min(5, Math.round(score)));
  const tone = scoreTone(clamped * 20);
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        role="meter"
        aria-label="Rubric score"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={clamped}
        aria-valuetext={`${clamped} of 5`}
        className="flex gap-1"
      >
        {RUBRIC_LEVELS.map((level) => (
          <span
            key={level}
            className={cn("h-2 w-5 rounded-full sm:w-6", level <= clamped ? segmentTone[tone] : "bg-slate-200")}
            aria-hidden
          />
        ))}
      </div>
      <span className="text-sm font-semibold tabular-nums text-slate-900">
        {clamped}
        <span className="font-medium text-slate-400">/5</span>
      </span>
    </div>
  );
}
