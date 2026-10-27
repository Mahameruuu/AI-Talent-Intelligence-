import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleDashed,
  Clock,
  Globe,
  Loader2,
  MailCheck,
  MailWarning,
  MailX,
  MinusCircle,
  Upload,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type {
  ApplicationFormStatus,
  ApplicationSource,
  ApplicationStage,
  DocumentStatus,
  EmailStatus,
  InterviewEvaluation,
  InterviewStatus,
  InterviewTemplate,
  JobStatus,
  PipelineStep,
  Recommendation,
  RequirementStatus,
} from "@/types/api";
import type { BadgeTone } from "./badge";

export interface StatusValues {
  document: DocumentStatus;
  stage: ApplicationStage;
  job: JobStatus;
  interview: InterviewStatus;
  evaluation: InterviewEvaluation["status"];
  template: InterviewTemplate["status"];
  requirement: RequirementStatus;
  /** Requirement status for application-form screening questions (answer vs. expected answer). */
  screening: RequirementStatus;
  step: PipelineStep["status"];
  recommendation: Recommendation;
  user: "active" | "inactive";
  form: ApplicationFormStatus;
  source: ApplicationSource;
  email: EmailStatus | "not_requested";
}

export type StatusKind = keyof StatusValues;

export interface StatusConfig {
  label: string;
  tone: BadgeTone;
  icon?: LucideIcon;
  spin?: boolean;
}

const STATUS_CONFIG: { [K in StatusKind]: Record<StatusValues[K], StatusConfig> } = {
  document: {
    queued: { label: "Queued", tone: "neutral", icon: Clock },
    processing: { label: "Processing", tone: "info", icon: Loader2, spin: true },
    completed: { label: "Processed", tone: "success", icon: CheckCircle2 },
    failed: { label: "Failed", tone: "danger", icon: XCircle },
  },
  stage: {
    applied: { label: "Applied", tone: "neutral" },
    screening: { label: "Screening", tone: "info" },
    shortlisted: { label: "Shortlisted", tone: "primary" },
    interview: { label: "Interview", tone: "violet" },
    offer: { label: "Offer", tone: "success" },
    hired: { label: "Hired", tone: "success", icon: CheckCircle2 },
    rejected: { label: "Rejected", tone: "danger", icon: XCircle },
    withdrawn: { label: "Withdrawn", tone: "neutral" },
  },
  job: {
    draft: { label: "Draft", tone: "neutral", icon: CircleDashed },
    open: { label: "Open", tone: "success" },
    closed: { label: "Closed", tone: "dark" },
  },
  interview: {
    pending: { label: "Invited", tone: "neutral", icon: Clock },
    in_progress: { label: "In progress", tone: "info", icon: Loader2 },
    completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
    expired: { label: "Expired", tone: "warning", icon: Clock },
    revoked: { label: "Revoked", tone: "danger", icon: Ban },
  },
  evaluation: {
    pending: { label: "Pending", tone: "neutral", icon: Clock },
    processing: { label: "Evaluating", tone: "info", icon: Loader2, spin: true },
    completed: { label: "Evaluated", tone: "success", icon: CheckCircle2 },
    needs_review: { label: "Needs review", tone: "warning", icon: AlertTriangle },
    failed: { label: "Failed", tone: "danger", icon: XCircle },
  },
  template: {
    draft: { label: "Draft", tone: "warning", icon: CircleDashed },
    approved: { label: "Approved", tone: "success", icon: CheckCircle2 },
  },
  requirement: {
    matched: { label: "Matched", tone: "success", icon: CheckCircle2 },
    not_found: { label: "Not Found in CV", tone: "danger", icon: XCircle },
    needs_review: { label: "Needs Review", tone: "warning", icon: AlertTriangle },
  },
  screening: {
    matched: { label: "Met", tone: "success", icon: CheckCircle2 },
    not_found: { label: "Not met", tone: "danger", icon: XCircle },
    needs_review: { label: "Needs Review", tone: "warning", icon: AlertTriangle },
  },
  step: {
    ok: { label: "OK", tone: "success", icon: CheckCircle2 },
    skipped: { label: "Skipped", tone: "neutral", icon: MinusCircle },
    warning: { label: "Warning", tone: "warning", icon: AlertTriangle },
    failed: { label: "Failed", tone: "danger", icon: XCircle },
  },
  recommendation: {
    advance: { label: "Advance", tone: "success" },
    hold: { label: "Hold", tone: "neutral" },
    needs_more_info: { label: "Needs more info", tone: "warning" },
    not_proceed: { label: "Do not proceed", tone: "danger" },
  },
  user: {
    active: { label: "Active", tone: "success" },
    inactive: { label: "Inactive", tone: "neutral" },
  },
  form: {
    draft: { label: "Draft", tone: "warning", icon: CircleDashed },
    published: { label: "Live", tone: "success", icon: CheckCircle2 },
    closed: { label: "Closed", tone: "dark", icon: Ban },
  },
  source: {
    public_form: { label: "Applied via form", tone: "primary", icon: Globe },
    hr_upload: { label: "Uploaded by HR", tone: "neutral", icon: Upload },
    manual: { label: "Added manually", tone: "neutral", icon: UserPlus },
  },
  email: {
    sent: { label: "Email sent", tone: "success", icon: MailCheck },
    failed: { label: "Email failed", tone: "danger", icon: MailX },
    not_configured: { label: "SMTP not configured", tone: "warning", icon: MailWarning },
    not_requested: { label: "Not emailed", tone: "neutral", icon: MinusCircle },
  },
};

export function getStatusConfig<K extends StatusKind>(kind: K, value: StatusValues[K]): StatusConfig {
  const map: Record<StatusValues[K], StatusConfig> = STATUS_CONFIG[kind];
  return map[value] ?? { label: String(value), tone: "neutral" };
}

export function getStatusLabel<K extends StatusKind>(kind: K, value: StatusValues[K]): string {
  return getStatusConfig(kind, value).label;
}
