import { Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button, Dialog, useToast } from "@/components/ui";
import { useCandidate, useDeleteApplication, useDeleteCandidate } from "@/hooks/queries/candidates";
import { getErrorMessage } from "@/services/api-client";
import { pluralize } from "@/utils/format";

export type DeleteScope = "application" | "candidate";

export interface DeleteCandidateDialogProps {
  open: boolean;
  onClose: () => void;
  candidateId: number;
  candidateName: string;
  /** The application the dialog was opened from (a table row or the selected job on the detail page). */
  application?: { id: number; jobTitle: string };
  /** Pre-selected choice when the candidate has several applications. */
  defaultScope?: DeleteScope;
  /** Called after a successful delete with what was deleted ("candidate" also when the last application went). */
  onDeleted?: (scope: DeleteScope) => void;
}

/**
 * Permanently delete a candidate and all their data. When opened for one application of a candidate with several
 * applications, HR can choose to delete only that application. Mount it per target (e.g. `{target ? <… /> : null}`)
 * so the choice starts at `defaultScope` each time.
 */
export function DeleteCandidateDialog({
  open,
  onClose,
  candidateId,
  candidateName,
  application,
  defaultScope = "candidate",
  onDeleted,
}: DeleteCandidateDialogProps) {
  const toast = useToast();
  const radioName = useId();
  // The application count comes from the candidate detail (already cached on the detail page).
  const candidateQuery = useCandidate(open ? candidateId : undefined);
  const count = candidateQuery.data?.applications.length;
  const deleteCandidate = useDeleteCandidate();
  const deleteApplication = useDeleteApplication();
  const [scope, setScope] = useState<DeleteScope>(defaultScope);
  const busy = deleteCandidate.isPending || deleteApplication.isPending;
  const canChoose = application !== undefined && count !== undefined && count > 1;
  const effective: DeleteScope = canChoose ? scope : "candidate";

  const close = () => {
    if (!busy) onClose();
  };

  const remove = async () => {
    try {
      if (effective === "application" && application) {
        await deleteApplication.mutateAsync({ id: application.id, candidateId });
        toast.success("Application deleted", `${candidateName} · ${application.jobTitle}`);
      } else {
        await deleteCandidate.mutateAsync(candidateId);
        toast.success("Candidate deleted", candidateName);
      }
      onClose();
      onDeleted?.(effective);
    } catch (error) {
      toast.error(effective === "application" ? "Couldn't delete the application" : "Couldn't delete the candidate",
        getErrorMessage(error));
    }
  };

  const applications = count === undefined ? "all applications" : pluralize(count, "application");

  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      dismissible={!busy}
      title={effective === "application" ? "Delete application?" : "Delete candidate?"}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" leftIcon={<Trash2 />} onClick={() => void remove()} loading={busy}>
            {effective === "application" ? "Delete application" : "Delete candidate"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {canChoose ? (
          <fieldset className="space-y-2">
            <legend className="sr-only">What to delete</legend>
            {(
              [
                ["application", `Only this application (${application.jobTitle})`],
                ["candidate", `The whole candidate (all ${count} applications)`],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 px-3 py-2.5 has-[:checked]:border-rose-300 has-[:checked]:bg-rose-50/60"
              >
                <input
                  type="radio"
                  name={radioName}
                  value={value}
                  checked={scope === value}
                  onChange={() => setScope(value)}
                  disabled={busy}
                  className="mt-0.5 size-4 shrink-0 accent-rose-600"
                />
                <span className="text-sm font-medium text-slate-900">{label}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <p className="text-sm text-slate-600">
          {effective === "application" && application
            ? `${candidateName}'s application for ${application.jobTitle} will be permanently deleted: CV files, screening results, AI interviews and evaluations for this job. Their other applications are kept. This can't be undone.`
            : `${candidateName} and all their data will be permanently deleted: ${applications}, CV files, screening results, AI interviews and evaluations. This can't be undone.`}
        </p>
      </div>
    </Dialog>
  );
}
