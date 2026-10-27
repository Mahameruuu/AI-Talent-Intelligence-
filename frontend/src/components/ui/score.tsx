import { cn } from "@/utils/cn";
import { formatScore } from "@/utils/format";
import { SCORE_TONE_LABELS, scoreTone, type ScoreTone } from "@/utils/score";

const badgeTone: Record<ScoreTone, string> = {
  high: "bg-emerald-50 text-emerald-700 ring-emerald-600/25",
  medium: "bg-amber-50 text-amber-800 ring-amber-600/25",
  low: "bg-rose-50 text-rose-700 ring-rose-600/20",
  none: "bg-slate-50 text-slate-500 ring-slate-400/25",
};

const barTone: Record<ScoreTone, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-rose-500",
  none: "bg-slate-300",
};

const ringTone: Record<ScoreTone, string> = {
  high: "text-emerald-500",
  medium: "text-amber-500",
  low: "text-rose-500",
  none: "text-slate-300",
};

export interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Show "/100" after the value. */
  showMax?: boolean;
}

/** Match score 0..100 with consistent colour bands; null renders a neutral "—". */
export function ScoreBadge({ score, size = "md", className, showMax = false }: ScoreBadgeProps) {
  const tone = scoreTone(score);
  const label = tone === "none" ? "Not scored" : `Match score ${formatScore(score)} of 100 (${SCORE_TONE_LABELS[tone]})`;
  return (
    <span
      title={label}
      aria-label={label}
      data-tone={tone}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-semibold tabular-nums ring-1 ring-inset",
        size === "sm" && "min-w-8 px-1.5 py-px text-xs",
        size === "md" && "min-w-10 px-2 py-0.5 text-sm",
        size === "lg" && "min-w-14 px-3 py-1 text-lg",
        badgeTone[tone],
        className,
      )}
    >
      {formatScore(score)}
      {showMax && tone !== "none" ? <span className="ml-0.5 text-[0.75em] font-medium opacity-60">/100</span> : null}
    </span>
  );
}

export interface ScoreBarProps {
  score: number | null | undefined;
  max?: number;
  label?: string;
  className?: string;
  showValue?: boolean;
}

/** Horizontal bar for a 0..max score. */
export function ScoreBar({ score, max = 100, label, className, showValue = true }: ScoreBarProps) {
  const normalized = score === null || score === undefined ? null : Math.max(0, Math.min(100, (score / max) * 100));
  const tone = scoreTone(normalized);
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        role="meter"
        aria-label={label ?? "Score"}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={score ?? undefined}
        aria-valuetext={score === null || score === undefined ? "Not computable" : `${formatScore(score)} of ${max}`}
        className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"
      >
        {normalized !== null ? (
          <div className={cn("h-full rounded-full transition-[width] duration-500", barTone[tone])} style={{ width: `${normalized}%` }} />
        ) : (
          <div className="h-full w-full bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgb(226_232_240)_4px,rgb(226_232_240)_8px)]" />
        )}
      </div>
      {showValue ? (
        <span className="w-9 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">{formatScore(score)}</span>
      ) : null}
    </div>
  );
}

/** Large circular score for page headers. */
export function ScoreRing({ score, size = 96, label = "Match score" }: { score: number | null | undefined; size?: number; label?: string }) {
  const tone = scoreTone(score);
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const value = score === null || score === undefined ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-slate-100" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
          className={cn("transition-[stroke-dashoffset] duration-700", ringTone[tone])}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-label={`${label}: ${formatScore(score, "not computable")}`}>
        <span className="text-2xl font-semibold tabular-nums text-slate-900">{formatScore(score)}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">of 100</span>
      </div>
    </div>
  );
}
