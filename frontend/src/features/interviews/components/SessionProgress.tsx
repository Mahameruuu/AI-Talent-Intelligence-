import { Progress } from "@/components/ui";
import type { InterviewSession } from "@/types/api";
import { cn } from "@/utils/cn";
import { getSessionProgress } from "../interview-utils";

export function SessionProgress({
  session,
  className,
  barClassName,
}: {
  session: Pick<InterviewSession, "questions_answered" | "questions_total" | "status">;
  className?: string;
  barClassName?: string;
}) {
  const { answered, total, percent } = getSessionProgress(session);
  return (
    <div className={cn("flex min-w-24 flex-col gap-1", className)}>
      <span className="text-xs tabular-nums text-slate-600">
        <span className="font-semibold text-slate-800">{answered}</span>/{total} answered
      </span>
      <Progress
        value={percent}
        tone={session.status === "completed" ? "success" : "primary"}
        label={`${answered} of ${total} questions answered`}
        className={barClassName}
      />
    </div>
  );
}
