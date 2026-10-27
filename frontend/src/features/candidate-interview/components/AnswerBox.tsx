import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/utils/cn";
import { formatNumber } from "@/utils/format";
import { MAX_ANSWER_LENGTH } from "../candidate-interview-utils";
import { useInterviewCopy } from "../i18n";

/** Editable answer: recognised speech lands here and can be corrected (or typed from scratch). */
export function AnswerBox({
  value,
  interim,
  onChange,
  onSubmit,
  disabled,
  voiceMode,
  variant = "dark",
  autoFocus = false,
}: {
  value: string;
  interim: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  /** Speech recognition is available and listening is possible. */
  voiceMode: boolean;
  variant?: "dark" | "light";
  autoFocus?: boolean;
}) {
  const t = useInterviewCopy();
  const ref = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  const counterId = useId();
  const interimId = useId();
  const nearLimit = value.length >= MAX_ANSWER_LENGTH * 0.9;
  const dark = variant === "dark";

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!disabled) onSubmit();
  };

  return (
    <div>
      <label htmlFor={inputId} className={cn("mb-1 block text-xs font-medium", dark ? "text-[#bdc1c6]" : "text-slate-600")}>
        {t.yourAnswer}
      </label>
      <textarea
        ref={ref}
        id={inputId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        maxLength={MAX_ANSWER_LENGTH}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={disabled ? t.waitingForInterviewer : voiceMode ? t.answerPlaceholderVoice : t.answerPlaceholderText}
        aria-describedby={`${interimId} ${counterId}`}
        className={cn(
          "scrollbar-thin max-h-40 min-h-16 w-full resize-none rounded-xl border px-3 py-2.5 text-base leading-relaxed focus:outline-none focus:ring-2 disabled:cursor-not-allowed sm:text-[15px]",
          dark
            ? "border-white/10 bg-[#303134] text-[#e8eaed] placeholder:text-[#9aa0a6] focus:border-sky-400 focus:ring-sky-400/30 disabled:opacity-60"
            : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-indigo-500/20 disabled:bg-slate-50",
        )}
      />
      <div className="mt-1 flex items-start justify-between gap-3 text-xs">
        <p id={interimId} className={cn("min-h-4 italic", dark ? "text-[#9aa0a6]" : "text-slate-400")} aria-live="polite">
          {interim}
        </p>
        <span
          id={counterId}
          className={cn(
            "shrink-0 tabular-nums",
            dark ? "text-[#9aa0a6]" : "text-slate-400",
            nearLimit && (dark ? "font-medium text-amber-300" : "font-medium text-amber-700"),
          )}
        >
          {formatNumber(value.length)} / {formatNumber(MAX_ANSWER_LENGTH)}
        </span>
      </div>
    </div>
  );
}
