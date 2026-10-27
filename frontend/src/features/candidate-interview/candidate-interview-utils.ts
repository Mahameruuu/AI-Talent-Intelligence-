import { getErrorMessage, isApiError } from "@/services/api-client";
import type { CandidateInterviewState } from "@/types/api";

export const MAX_ANSWER_LENGTH = 4000;

/** Read the invitation token from a URL fragment ("#<token>"). Returns null when it's missing. */
export function readTokenFromHash(hash: string): string | null {
  const raw = (hash.startsWith("#") ? hash.slice(1) : hash).trim();
  if (!raw) return null;
  return safeDecode(raw) || null;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value).trim();
  } catch {
    // Malformed percent-encoding: fall back to the raw fragment.
    return value;
  }
}

/** Outcomes after which the candidate can't continue in this tab. */
export type TerminalReason = "invalid" | "expired" | "revoked" | "completed";

/** Map documented API errors (401 invalid_token, 410 expired/revoked, 409 completed) to a terminal screen. */
export function terminalReasonFromError(error: unknown): TerminalReason | null {
  if (!isApiError(error)) return null;
  if (error.status === 401 || error.status === 404) return "invalid";
  if (error.status === 410) return /expire/i.test(error.code) ? "expired" : "revoked";
  if (error.status === 409 && /complete/i.test(error.code)) return "completed";
  return null;
}

export function terminalReasonFromState(state: CandidateInterviewState): TerminalReason | null {
  if (state.status === "completed") return "completed";
  if (state.status === "expired") return "expired";
  if (state.status === "revoked") return "revoked";
  return null;
}

export interface InterviewProgress {
  /** 1-based number of the question currently being answered. */
  current: number;
  total: number;
  answered: number;
  percent: number;
  allAnswered: boolean;
}

export function getInterviewProgress(state: Pick<CandidateInterviewState, "questions_answered" | "questions_total">): InterviewProgress {
  const total = Math.max(0, state.questions_total);
  const answered = Math.max(0, Math.min(state.questions_answered, total));
  return {
    current: total > 0 ? Math.min(answered + 1, total) : 0,
    total,
    answered,
    percent: total > 0 ? (answered / total) * 100 : 0,
    allAnswered: total > 0 && answered >= total,
  };
}

/** "<prefix> <api message>" with a single "Please try again." hint. */
export function describeActionError(prefix: string, error: unknown): string {
  const message = getErrorMessage(error).trim();
  const text = prefix ? `${prefix} ${message}` : message;
  return /try again/i.test(message) ? text : `${text} Please try again.`;
}

/** BCP-47 tag for speech APIs; falls back to the interview language when the API leaves it empty. */
export function resolveSpeechLang(state: Pick<CandidateInterviewState, "speech_lang" | "language">): string {
  const tag = state.speech_lang?.trim();
  if (tag) return tag;
  return state.language === "en" ? "en-US" : "id-ID";
}

/** "Pertanyaan x dari y" numbers: prefer the API's current question, else derive from answered count. */
export function questionPosition(state: CandidateInterviewState): { index: number; total: number; isFollowUp: boolean } | null {
  const current = state.current_question;
  if (current && current.total > 0) {
    return { index: Math.min(Math.max(current.index, 1), current.total), total: current.total, isFollowUp: current.is_follow_up };
  }
  const progress = getInterviewProgress(state);
  return progress.total > 0 ? { index: progress.current, total: progress.total, isFollowUp: false } : null;
}

/** The interviewer utterance to read aloud / caption: current_question, else the latest assistant message. */
export function currentInterviewerUtterance(
  state: CandidateInterviewState,
): { key: string; text: string; messageId: number | null } | null {
  const current = state.current_question;
  if (current?.text.trim()) {
    return {
      key: current.message_id !== null ? `m${current.message_id}` : `t${current.text}`,
      text: current.text,
      messageId: current.message_id,
    };
  }
  const latest = [...state.messages].reverse().find((message) => message.role === "assistant");
  if (!latest || state.messages[state.messages.length - 1]?.role !== "assistant") return null;
  return { key: `m${latest.id}`, text: latest.content, messageId: latest.id };
}

/** Conversational mode: an acknowledgement never holds the next question back for longer than this. */
export const ACK_MAX_MS = 6000;

/** Upper bound for reading the closing message before the room leaves anyway (it can never hang). */
export function closingTimeoutMs(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.min(90_000, Math.max(15_000, words * 600 + 15_000));
}

/**
 * Conversational mode: the closing message the interviewer reads after the final answer (the last
 * assistant message of a completed session), or null when there is none to read.
 */
export function closingMessage(
  state: Pick<CandidateInterviewState, "mode" | "status" | "messages">,
): { key: string; text: string; messageId: number } | null {
  if (state.mode !== "conversational" || state.status !== "completed") return null;
  const last = state.messages[state.messages.length - 1];
  if (!last || last.role !== "assistant" || !last.content.trim()) return null;
  return { key: `m${last.id}`, text: last.content, messageId: last.id };
}

/** mm:ss (or h:mm:ss) for the call timer. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** Append a recognised phrase to the editable answer with a single space, capped at the API limit. */
export function appendPhrase(current: string, phrase: string): string {
  const text = phrase.trim();
  if (!text) return current;
  const base = current.trimEnd();
  return (base ? `${base} ${text}` : text).slice(0, MAX_ANSWER_LENGTH);
}
