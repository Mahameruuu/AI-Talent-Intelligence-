import { MessagesSquare } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import { Card, CardContent, CardHeader } from "@/components/ui";
import type { InterviewMode } from "@/types/api";
import { cn } from "@/utils/cn";
import { conversationalSettings, type TemplateFormValues } from "./template-form";

const STYLE_OPTIONS: { value: InterviewMode; label: string; description: string }[] = [
  {
    value: "conversational",
    label: "Conversational (like a real HR interviewer)",
    description:
      "The AI greets the candidate, asks them to introduce themselves, asks 2–3 questions on your top-weighted competencies with natural follow-on, then invites their questions and closes — about 5–7 minutes.",
  },
  {
    value: "template",
    label: "Fixed questions",
    description: "The AI asks the questions from your question bank in order, with follow-ups when an answer is too short.",
  },
];

/** "Interview style": a short human-like conversation, or the template's fixed questions in order. */
export function InterviewStyleSection() {
  const { control, getValues, setValue } = useFormContext<TemplateFormValues>();
  const mode = useWatch({ control, name: "mode" });
  const active = STYLE_OPTIONS.find((option) => option.value === mode);

  const choose = (next: InterviewMode) => {
    if (next === mode) return;
    setValue("mode", next, { shouldDirty: true });
    if (next !== "conversational") return;
    // Keep the settings within the conversational limits (3–5 questions, 5–10 minutes).
    const snapped = conversationalSettings(Number(getValues("num_questions")), Number(getValues("duration_minutes")));
    setValue("num_questions", snapped.num_questions, { shouldDirty: true });
    setValue("duration_minutes", snapped.duration_minutes, { shouldDirty: true });
  };

  return (
    <Card>
      <CardHeader icon={<MessagesSquare />} title="Interview style" />
      <CardContent className="space-y-3">
        <div role="radiogroup" aria-label="Interview style" className="grid gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-2">
          {STYLE_OPTIONS.map((option) => {
            const checked = option.value === mode;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                onClick={() => choose(option.value)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
                  checked ? "bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5" : "text-slate-500 enabled:hover:text-slate-800",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {active ? <p className="text-sm text-slate-600">{active.description}</p> : null}
      </CardContent>
    </Card>
  );
}
