import type { BulkInviteResponse, BulkInviteResult } from "@/types/api";

export interface BulkInviteSummary {
  invited: number;
  emailed: number;
  skipped: number;
  emailFailed: number;
}

export function summarizeBulkInvite(response: BulkInviteResponse): BulkInviteSummary {
  const skipped = response.results.filter((result) => result.status === "skipped").length;
  const emailFailed = response.results.filter(
    (result) => result.status === "invited" && result.email_status === "failed",
  ).length;
  return { invited: response.invited, emailed: response.emailed, skipped, emailFailed };
}

/** Invited candidates whose link was not delivered by email, so HR has to share it manually. */
export function linksToShare(results: BulkInviteResult[]): BulkInviteResult[] {
  return results.filter(
    (result) => result.status === "invited" && result.email_status !== "sent" && Boolean(result.invitation_url),
  );
}
