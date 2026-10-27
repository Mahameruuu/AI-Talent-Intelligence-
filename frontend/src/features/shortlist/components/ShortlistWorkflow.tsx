import { useQueryClient } from "@tanstack/react-query";
import { Info, Send, Sparkles, UserCheck, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { Button, FilterField, Input, useToast } from "@/components/ui";
import { useApplications } from "@/hooks/queries/candidates";
import { useShortlist } from "@/hooks/queries/jobs";
import { OPTIONS_PAGE_SIZE } from "@/hooks/queries/shared";
import { getErrorMessage } from "@/services/api-client";
import { applicationsApi, type ApplicationListParams } from "@/services/candidates-api";
import { queryKeys } from "@/services/query-keys";
import type { Job } from "@/types/api";
import { pluralize } from "@/utils/format";
import { MATCH_DISCLAIMER } from "@/utils/score";
import { DEFAULT_TOP_N, parseMinScore, parseTopN, selectTopApplications } from "../shortlist-utils";
import { toRecipient, type ShortlistSelection } from "../use-shortlist-selection";
import { BulkInviteDialog, type BulkInviteRecipient } from "./BulkInviteDialog";

export interface ShortlistWorkflowProps {
  job: Pick<Job, "id" | "title">;
  selection: ShortlistSelection;
  /** The applicants table (with selection checkboxes). */
  children: ReactNode;
}

/**
 * Shortlist tools around a job's applicants table: preselect the top N by match score, shortlist the
 * selection (an HR decision) and invite candidates to the AI interview in one go.
 */
export function ShortlistWorkflow({ job, selection, children }: ShortlistWorkflowProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const topNId = useId();
  const minScoreId = useId();
  const shortlist = useShortlist(job.id);
  const shortlistedQuery = useApplications({ job_id: job.id, stage: "shortlisted", page: 1, page_size: OPTIONS_PAGE_SIZE });
  const shortlisted = shortlistedQuery.data?.items ?? [];

  const [topNText, setTopNText] = useState(String(DEFAULT_TOP_N));
  const [minScoreText, setMinScoreText] = useState("");
  const [ranking, setRanking] = useState(false);
  const [pendingAction, setPendingAction] = useState<"shortlist" | "invite" | null>(null);
  const [inviteRecipients, setInviteRecipients] = useState<BulkInviteRecipient[] | null>(null);

  const topN = parseTopN(topNText);
  const minScore = parseMinScore(minScoreText);

  const applyTopN = async () => {
    if (topN.value === undefined || minScore.error) return;
    const params: ApplicationListParams = { job_id: job.id, sort: "score", page: 1, page_size: OPTIONS_PAGE_SIZE };
    setRanking(true);
    try {
      const ranked = await queryClient.fetchQuery({
        queryKey: queryKeys.applications.list(params),
        queryFn: ({ signal }) => applicationsApi.list(params, signal),
      });
      const top = selectTopApplications(ranked.items, topN.value, minScore.value);
      selection.replace(top.map(toRecipient));
      if (top.length === 0) {
        toast.toast({
          tone: "warning",
          title: "No candidates match",
          description: "Only screened candidates in Applied or Screening are preselected. Try a lower minimum score.",
        });
      } else if (top.length < topN.value) {
        toast.toast({
          tone: "info",
          title: `Selected ${pluralize(top.length, "candidate")}`,
          description: `Only ${top.length} screened candidate${top.length === 1 ? "" : "s"} in Applied/Screening meet the criteria.`,
        });
      }
    } catch (error) {
      toast.error("Couldn't rank the applicants", getErrorMessage(error));
    } finally {
      setRanking(false);
    }
  };

  const runShortlist = (thenInvite: boolean) => {
    const recipients = selection.recipients;
    if (recipients.length === 0) return;
    setPendingAction(thenInvite ? "invite" : "shortlist");
    const ids = recipients.map((recipient) => recipient.applicationId);
    shortlist.mutate(
      { application_ids: ids },
      {
        onSuccess: (result) => {
          const moved = new Set(result.items.map((application) => application.id));
          const skipped = ids.length - moved.size;
          toast.success(
            `${pluralize(moved.size, "candidate")} shortlisted`,
            skipped > 0 ? `${pluralize(skipped, "candidate")} couldn't be moved (no longer in Applied/Screening).` : job.title,
          );
          selection.clear();
          if (thenInvite && moved.size > 0) {
            setInviteRecipients(recipients.filter((recipient) => moved.has(recipient.applicationId)));
          }
        },
        onError: (error) => toast.error("Couldn't shortlist the candidates", getErrorMessage(error)),
        onSettled: () => setPendingAction(null),
      },
    );
  };

  return (
    <>
      <div
        className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end"
        role="group"
        aria-label="Shortlist for AI interview"
      >
        <FilterField label="Select top" htmlFor={topNId} className="sm:w-24 lg:w-24">
          <Input
            id={topNId}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={topNText}
            onChange={(event) => setTopNText(event.target.value)}
            aria-invalid={topN.error ? true : undefined}
          />
        </FilterField>
        <FilterField label="Min. score (optional)" htmlFor={minScoreId} className="sm:w-36 lg:w-36">
          <Input
            id={minScoreId}
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            placeholder="e.g. 60"
            value={minScoreText}
            onChange={(event) => setMinScoreText(event.target.value)}
            aria-invalid={minScore.error ? true : undefined}
          />
        </FilterField>
        <Button
          variant="secondary"
          leftIcon={<Sparkles />}
          onClick={() => void applyTopN()}
          loading={ranking}
          disabled={topN.value === undefined || Boolean(minScore.error)}
        >
          Select top {topN.value ?? "N"}
        </Button>
        {shortlisted.length > 0 ? (
          <Button variant="outline" leftIcon={<Send />} onClick={() => setInviteRecipients(shortlisted.map(toRecipient))}>
            Invite shortlisted ({shortlisted.length})
          </Button>
        ) : null}
        <p className="flex items-start gap-1.5 text-xs text-slate-500 sm:ml-auto sm:max-w-80">
          <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
          <span>
            {topN.error ??
              minScore.error ??
              `Shortlisting is an HR decision. ${MATCH_DISCLAIMER} Only candidates in Applied or Screening can be selected.`}
          </span>
        </p>
      </div>

      {children}

      {selection.count > 0 ? (
        <div
          className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-b-xl border-t border-indigo-100 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgb(15_23_42/0.12)] backdrop-blur"
          role="region"
          aria-label="Shortlist actions"
        >
          <p className="mr-auto text-sm font-medium text-slate-800">
            <UserCheck className="mr-1.5 inline size-4 text-indigo-600" aria-hidden />
            {selection.count} selected
          </p>
          <Button variant="ghost" leftIcon={<X />} onClick={selection.clear} disabled={shortlist.isPending}>
            Clear
          </Button>
          <Button
            variant="secondary"
            onClick={() => runShortlist(false)}
            loading={pendingAction === "shortlist"}
            disabled={shortlist.isPending}
          >
            Shortlist
          </Button>
          <Button
            leftIcon={<Send />}
            onClick={() => runShortlist(true)}
            loading={pendingAction === "invite"}
            disabled={shortlist.isPending}
          >
            Shortlist &amp; invite to AI interview
          </Button>
        </div>
      ) : null}

      <BulkInviteDialog
        open={inviteRecipients !== null}
        onClose={() => setInviteRecipients(null)}
        jobId={job.id}
        recipients={inviteRecipients ?? []}
      />
    </>
  );
}
