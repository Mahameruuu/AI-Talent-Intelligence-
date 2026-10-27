import type { InterviewSession, InterviewStatus, InterviewTemplate } from "@/types/api";
import { getStatusLabel } from "@/components/ui";
import { humanize, pluralize } from "@/utils/format";
import { INTERVIEW_LANGUAGE_LABELS } from "@/utils/labels";

export const INTERVIEW_STATUSES: InterviewStatus[] = ["pending", "in_progress", "completed", "expired", "revoked"];

export const INTERVIEW_STATUS_OPTIONS = INTERVIEW_STATUSES.map((status) => ({
  value: status,
  label: getStatusLabel("interview", status),
}));

export function isInterviewStatus(value: string): value is InterviewStatus {
  return (INTERVIEW_STATUSES as string[]).includes(value);
}

/** "llm:claude-x" -> "LLM · claude-x", "rule-based-evidence-only" -> "Rule-based (evidence only)". */
export function formatEvaluationMethod(method: string): string {
  if (method.startsWith("llm:")) {
    const model = method.slice(4).trim();
    return model ? `LLM · ${model}` : "LLM";
  }
  if (method === "rule-based-evidence-only") return "Rule-based (evidence only)";
  return humanize(method);
}

export interface SessionProgressInfo {
  answered: number;
  total: number;
  percent: number;
}

export function getSessionProgress(session: Pick<InterviewSession, "questions_answered" | "questions_total">): SessionProgressInfo {
  const total = Math.max(0, session.questions_total);
  const answered = Math.max(0, Math.min(session.questions_answered, total || session.questions_answered));
  const percent = total > 0 ? (answered / total) * 100 : 0;
  return { answered, total, percent };
}

/** Invitation can still be revoked while the candidate hasn't finished. */
export function canRevokeSession(session: Pick<InterviewSession, "status">): boolean {
  return session.status === "pending" || session.status === "in_progress";
}

/** HR may force-complete an interview that has started or already holds answers. */
export function canForceCompleteSession(session: Pick<InterviewSession, "status" | "questions_answered">): boolean {
  return session.status === "in_progress" || (session.status === "pending" && session.questions_answered > 0);
}

export function hasEvaluationView(session: Pick<InterviewSession, "status" | "evaluation_status">): boolean {
  return session.evaluation_status !== null || session.status === "completed";
}

/** Parse "#message-42" into 42. */
export function parseMessageHash(hash: string): number | null {
  const match = /^#message-(\d+)$/.exec(hash);
  if (!match?.[1]) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) ? id : null;
}

export function messageAnchorId(messageId: number): string {
  return `message-${messageId}`;
}

/** Parse a positive integer route param. */
export function parseIdParam(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Questions asked per session: personalised CV questions first, then the template's questions. */
export function totalQuestionsPerSession(template: Pick<InterviewTemplate, "num_questions" | "cv_questions">): number {
  return template.num_questions + template.cv_questions;
}

/** "Bahasa Indonesia · 2 CV + 6 template = 8 questions · ~30 min" */
export function describeTemplateRun(
  template: Pick<InterviewTemplate, "language" | "num_questions" | "cv_questions" | "duration_minutes">,
): string {
  const total = totalQuestionsPerSession(template);
  const questions =
    template.cv_questions > 0
      ? `${template.cv_questions} from CV + ${template.num_questions} template = ${pluralize(total, "question")}`
      : pluralize(total, "question");
  return `${INTERVIEW_LANGUAGE_LABELS[template.language] ?? template.language} · ${questions} · ~${template.duration_minutes} min`;
}
