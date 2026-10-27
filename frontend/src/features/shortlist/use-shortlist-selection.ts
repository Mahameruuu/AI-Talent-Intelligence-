import { useCallback, useMemo, useState } from "react";
import type { Application } from "@/types/api";
import type { BulkInviteRecipient } from "./components/BulkInviteDialog";

export function toRecipient(application: Pick<Application, "id" | "candidate_id" | "candidate_name">): BulkInviteRecipient {
  return { applicationId: application.id, candidateId: application.candidate_id, candidateName: application.candidate_name };
}

const EMPTY: ReadonlyMap<number, BulkInviteRecipient> = new Map();

/**
 * Applications selected for shortlisting, keyed by application id so the selection survives paging
 * and searching. The selection belongs to one job and is dropped when another job is chosen.
 */
export function useShortlistSelection(jobId: number | undefined) {
  const [state, setState] = useState<{ jobId: number | undefined; items: ReadonlyMap<number, BulkInviteRecipient> }>({
    jobId,
    items: EMPTY,
  });
  const selected = state.jobId === jobId ? state.items : EMPTY;

  const update = useCallback(
    (change: (current: Map<number, BulkInviteRecipient>) => void) =>
      setState((previous) => {
        const next = new Map(previous.jobId === jobId ? previous.items : EMPTY);
        change(next);
        return { jobId, items: next };
      }),
    [jobId],
  );

  const toggle = useCallback(
    (recipient: BulkInviteRecipient) =>
      update((items) => {
        if (items.has(recipient.applicationId)) items.delete(recipient.applicationId);
        else items.set(recipient.applicationId, recipient);
      }),
    [update],
  );

  /** Select (or unselect) all of these at once, e.g. every eligible row on the current page. */
  const setMany = useCallback(
    (recipients: BulkInviteRecipient[], checked: boolean) =>
      update((items) => {
        for (const recipient of recipients) {
          if (checked) items.set(recipient.applicationId, recipient);
          else items.delete(recipient.applicationId);
        }
      }),
    [update],
  );

  const replace = useCallback(
    (recipients: BulkInviteRecipient[]) =>
      update((items) => {
        items.clear();
        for (const recipient of recipients) items.set(recipient.applicationId, recipient);
      }),
    [update],
  );

  const clear = useCallback(() => update((items) => items.clear()), [update]);

  return useMemo(
    () => ({
      selected,
      count: selected.size,
      recipients: [...selected.values()],
      isSelected: (applicationId: number) => selected.has(applicationId),
      toggle,
      setMany,
      replace,
      clear,
    }),
    [selected, toggle, setMany, replace, clear],
  );
}

export type ShortlistSelection = ReturnType<typeof useShortlistSelection>;
