import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import type { CandidateInterviewState } from "@/types/api";
import { cn } from "@/utils/cn";
import { formatTime } from "@/utils/format";
import { useInterviewCopy } from "../i18n";

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/** Side panel with the whole conversation (auto-scrolling) and, below it, the answer box. */
export function TranscriptPanel({
  messages,
  interviewerName,
  candidateName,
  pendingAnswer,
  onClose,
  children,
}: {
  messages: CandidateInterviewState["messages"];
  interviewerName: string;
  candidateName: string;
  /** Answer currently being sent (shown optimistically). */
  pendingAnswer: string | null;
  onClose: () => void;
  children: ReactNode;
}) {
  const t = useInterviewCopy();
  const endRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [messages.length, pendingAnswer]);

  return (
    <aside
      aria-label={t.transcript}
      className="absolute inset-0 z-40 flex flex-col bg-white text-slate-900 md:static md:inset-auto md:z-auto md:my-2 md:mr-3 md:w-96 md:shrink-0 md:rounded-2xl"
    >
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <h2 className="text-lg font-medium">{t.transcript}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.closeTranscript}
          className="flex size-9 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
      <ol className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-2" aria-label={t.transcript}>
        {messages.length === 0 && !pendingAnswer ? <li className="text-sm text-slate-500">{t.noMessagesYet}</li> : null}
        {messages.map((message) => {
          const fromInterviewer = message.role === "assistant";
          return (
            <li key={message.id} className={cn("flex flex-col", fromInterviewer ? "items-start" : "items-end")}>
              <p className="mb-1 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{fromInterviewer ? interviewerName : candidateName}</span>{" "}
                <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>
              </p>
              <p
                className={cn(
                  "max-w-[92%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  fromInterviewer ? "rounded-tl-md bg-slate-100 text-slate-800" : "rounded-tr-md bg-indigo-600 text-white",
                )}
              >
                {message.content}
              </p>
            </li>
          );
        })}
        {pendingAnswer ? (
          <li className="flex flex-col items-end opacity-70">
            <p className="max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-indigo-600 px-3.5 py-2.5 text-sm leading-relaxed text-white">
              {pendingAnswer}
            </p>
          </li>
        ) : null}
        <li ref={endRef} aria-hidden />
      </ol>
      <div className="border-t border-slate-100 px-5 pb-4 pt-3">{children}</div>
    </aside>
  );
}
