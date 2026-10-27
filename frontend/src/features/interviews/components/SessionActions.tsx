import { Ban, CheckCheck } from "lucide-react";
import { useState } from "react";
import { Button, ConfirmDialog, useToast } from "@/components/ui";
import { useCompleteInterview, useRevokeInterview } from "@/hooks/queries/interviews";
import { getErrorMessage } from "@/services/api-client";
import type { InterviewSession } from "@/types/api";
import { canForceCompleteSession, canRevokeSession, getSessionProgress } from "../interview-utils";

/** Revoke / force-complete buttons with confirmations. */
export function SessionActions({ session }: { session: InterviewSession }) {
  const toast = useToast();
  const revokeMutation = useRevokeInterview(session.id);
  const completeMutation = useCompleteInterview(session.id);
  const [dialog, setDialog] = useState<"revoke" | "complete" | null>(null);
  const { answered, total } = getSessionProgress(session);

  const showRevoke = canRevokeSession(session);
  const showComplete = canForceCompleteSession(session);
  if (!showRevoke && !showComplete) return null;

  const revoke = () => {
    revokeMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Invitation revoked", "The candidate's link no longer works.");
        setDialog(null);
      },
      onError: (error) => toast.error("Couldn't revoke the invitation", getErrorMessage(error)),
    });
  };

  const complete = () => {
    completeMutation.mutate(undefined, {
      onSuccess: () => {
        toast.success("Interview marked as complete", "The AI evaluation has been started.");
        setDialog(null);
      },
      onError: (error) => toast.error("Couldn't complete the interview", getErrorMessage(error)),
    });
  };

  return (
    <>
      {showComplete ? (
        <Button variant="secondary" leftIcon={<CheckCheck />} onClick={() => setDialog("complete")}>
          Force complete
        </Button>
      ) : null}
      {showRevoke ? (
        <Button variant="danger-outline" leftIcon={<Ban />} onClick={() => setDialog("revoke")}>
          Revoke invitation
        </Button>
      ) : null}

      <ConfirmDialog
        open={dialog === "revoke"}
        onClose={() => setDialog(null)}
        onConfirm={revoke}
        loading={revokeMutation.isPending}
        tone="danger"
        title="Revoke this invitation?"
        description={`${session.candidate_name}'s interview link stops working immediately and can't be re-activated. Answers given so far are kept.`}
        confirmLabel="Revoke invitation"
      />
      <ConfirmDialog
        open={dialog === "complete"}
        onClose={() => setDialog(null)}
        onConfirm={complete}
        loading={completeMutation.isPending}
        title="Force complete this interview?"
        description={`The candidate won't be able to continue. The AI evaluation then runs on the answers given so far (${answered} of ${total} questions).`}
        confirmLabel="Complete & evaluate"
      />
    </>
  );
}
