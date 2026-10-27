import { Badge } from "@/components/ui";
import type { InterviewMessage, InterviewMode } from "@/types/api";
import { INTERVIEW_MODE_DESCRIPTIONS, INTERVIEW_MODE_LABELS } from "@/utils/labels";

/** Subtle "Conversational" / "Fixed questions" marker for a session. Older sessions without a mode are fixed. */
export function InterviewModeBadge({ mode }: { mode: InterviewMode | null | undefined }) {
  const value: InterviewMode = mode ?? "template";
  return (
    <Badge
      tone={value === "conversational" ? "primary" : "neutral"}
      size="sm"
      title={INTERVIEW_MODE_DESCRIPTIONS[value]}
      data-interview-mode={value}
    >
      {INTERVIEW_MODE_LABELS[value]}
    </Badge>
  );
}

/** Conversational turns: "AI" when the LLM wrote the turn, "Fallback" when a scripted text was used. */
export function TurnSourceBadge({ modeUsed }: { modeUsed: InterviewMessage["mode_used"] | undefined }) {
  if (modeUsed === "llm") {
    return (
      <Badge tone="neutral" size="sm" title="Worded by the AI during the conversation" data-mode-used="llm">
        AI
      </Badge>
    );
  }
  if (modeUsed === "fallback") {
    return (
      <Badge
        tone="warning"
        size="sm"
        title="Scripted fallback: the AI was unavailable for this turn, so a prepared text was used"
        data-mode-used="fallback"
      >
        Fallback
      </Badge>
    );
  }
  return null;
}
