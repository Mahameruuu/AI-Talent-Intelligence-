import { Bot, FileText, Keyboard, MessageSquareDashed, Mic } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Chip, EmptyState } from "@/components/ui";
import type { InterviewMessage } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatDateTime, formatTime, initials } from "@/utils/format";
import { messageAnchorId } from "../interview-utils";
import type { TranscriptHighlight } from "../use-transcript-highlight";
import { TurnSourceBadge } from "./InterviewModeBadge";

export interface InterviewTranscriptProps {
  messages: InterviewMessage[];
  candidateName: string;
  highlight?: TranscriptHighlight | null;
  /** Rendered instead of the list when there are no messages. */
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  className?: string;
  /** Ids of the session's CV-based questions, marked "From CV" in the transcript. */
  cvQuestionIds?: ReadonlySet<string>;
}

function InputModeIndicator({ mode }: { mode: InterviewMessage["input_mode"] }) {
  if (mode === null) return null;
  const voice = mode === "voice";
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500"
      title={voice ? "Answered by voice (speech-to-text)" : "Typed answer"}
      data-input-mode={mode}
    >
      {voice ? <Mic className="size-3" aria-hidden /> : <Keyboard className="size-3" aria-hidden />}
      {voice ? "Voice" : "Typed"}
    </span>
  );
}

function TranscriptMessage({
  message,
  candidateName,
  highlight,
  fromCv,
}: {
  message: InterviewMessage;
  candidateName: string;
  highlight: TranscriptHighlight | null | undefined;
  fromCv: boolean;
}) {
  const isAssistant = message.role === "assistant";
  const isHighlighted = highlight?.id === message.id;
  return (
    <li
      id={messageAnchorId(message.id)}
      tabIndex={-1}
      aria-current={isHighlighted ? "true" : undefined}
      className={cn(
        "relative flex scroll-mt-24 gap-3 rounded-xl p-2 transition-colors focus:outline-none",
        isAssistant ? "flex-row" : "flex-row-reverse",
        isHighlighted && "bg-amber-50 ring-2 ring-amber-300",
      )}
    >
      {highlight && isHighlighted ? (
        <span key={highlight.nonce} className="pointer-events-none absolute inset-0 rounded-xl animate-highlight" aria-hidden />
      ) : null}
      <div
        className={cn(
          "relative mt-5 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          isAssistant ? "bg-slate-200 text-slate-600" : "bg-indigo-100 text-indigo-700",
        )}
        aria-hidden
      >
        {isAssistant ? <Bot className="size-4" /> : initials(candidateName)}
      </div>
      <div className={cn("relative flex min-w-0 max-w-[85%] flex-col gap-1", isAssistant ? "items-start" : "items-end")}>
        <div className={cn("flex flex-wrap items-center gap-1.5 text-xs text-slate-500", !isAssistant && "justify-end")}>
          <span className="font-medium text-slate-700">{isAssistant ? "AI interviewer" : candidateName}</span>
          {isAssistant && message.competency ? <Chip className="py-0 text-[11px]">{message.competency}</Chip> : null}
          {isAssistant && fromCv && !message.is_follow_up ? (
            <Badge tone="info" size="sm">
              <FileText aria-hidden />
              From CV
            </Badge>
          ) : null}
          {!isAssistant ? <InputModeIndicator mode={message.input_mode} /> : null}
          {isAssistant && message.is_follow_up ? (
            <Badge tone="violet" size="sm">
              Follow-up
            </Badge>
          ) : null}
          {isAssistant ? <TurnSourceBadge modeUsed={message.mode_used} /> : null}
          <time dateTime={message.created_at} title={formatDateTime(message.created_at)} className="tabular-nums">
            {formatTime(message.created_at)}
          </time>
        </div>
        <div
          className={cn(
            "whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isAssistant
              ? "rounded-tl-sm border border-slate-200 bg-white text-slate-800"
              : "rounded-tr-sm bg-indigo-700 text-white",
          )}
        >
          {message.content}
        </div>
      </div>
    </li>
  );
}

/** Chat-style interview transcript. Each message is anchored as `#message-<id>`. */
export function InterviewTranscript({
  messages,
  candidateName,
  highlight,
  emptyTitle = "The candidate hasn't started yet",
  emptyDescription = "Messages appear here once the candidate opens the invitation link and starts the interview.",
  className,
  cvQuestionIds,
}: InterviewTranscriptProps) {
  if (messages.length === 0) {
    return <EmptyState icon={MessageSquareDashed} title={emptyTitle} description={emptyDescription} compact />;
  }
  return (
    <ol className={cn("flex flex-col gap-2", className)} aria-label="Interview transcript">
      {messages.map((message) => (
        <TranscriptMessage
          key={message.id}
          message={message}
          candidateName={candidateName}
          highlight={highlight}
          fromCv={Boolean(message.question_id && cvQuestionIds?.has(message.question_id))}
        />
      ))}
    </ol>
  );
}

export function TranscriptSkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: rows }, (_, index) => {
        const isAssistant = index % 2 === 0;
        return (
          <div key={index} className={cn("flex gap-3", isAssistant ? "flex-row" : "flex-row-reverse")}>
            <div className="size-8 shrink-0 animate-pulse rounded-full bg-slate-200/70" />
            <div className={cn("flex w-2/3 flex-col gap-2", !isAssistant && "items-end")}>
              <div className="h-3 w-24 animate-pulse rounded bg-slate-200/70" />
              <div className="h-14 w-full animate-pulse rounded-2xl bg-slate-200/70" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
