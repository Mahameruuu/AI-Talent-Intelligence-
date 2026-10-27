import { Lock, Trash2 } from "lucide-react";
import { useState } from "react";
import { Alert, Button, Dialog, FormField, Input, useToast } from "@/components/ui";
import { useDeleteJob, useUpdateJob } from "@/hooks/queries/jobs";
import { getErrorMessage } from "@/services/api-client";
import type { Job } from "@/types/api";
import { formatNumber } from "@/utils/format";

export interface DeleteJobDialogProps {
  job: Job;
  open: boolean;
  onClose: () => void;
  /** Called after the job was deleted (e.g. navigate back to the list). */
  onDeleted?: () => void;
}

/**
 * Delete a job. Jobs without applications are deleted after a simple confirmation. Jobs with applications are
 * protected: they can be deleted permanently only after typing the job title, which also removes those applications
 * (CVs, screenings, interviews) but keeps candidate profiles. Closing the job is offered as the safer alternative.
 */
export function DeleteJobDialog({ job, open, onClose, onDeleted }: DeleteJobDialogProps) {
  const toast = useToast();
  const deleteJob = useDeleteJob();
  const updateJob = useUpdateJob(job.id);
  const [typed, setTyped] = useState("");
  const hasApplications = job.candidate_count > 0;
  const needsForce = hasApplications;
  const confirmed = !needsForce || typed.trim() === job.title.trim();
  const busy = deleteJob.isPending || updateJob.isPending;

  const close = () => {
    if (busy) return;
    setTyped("");
    onClose();
  };

  const remove = async () => {
    try {
      await deleteJob.mutateAsync({ id: job.id, force: needsForce });
      toast.success("Job deleted", job.title);
      setTyped("");
      onClose();
      onDeleted?.();
    } catch (error) {
      toast.error("Couldn't delete the job", getErrorMessage(error));
    }
  };

  const closeJob = async () => {
    try {
      await updateJob.mutateAsync({ status: "closed" });
      toast.success("Job closed", job.title);
      onClose();
    } catch (error) {
      toast.error("Couldn't close the job", getErrorMessage(error));
    }
  };

  const applications = `${formatNumber(job.candidate_count)} application${job.candidate_count === 1 ? "" : "s"}`;

  return (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      dismissible={!busy}
      title="Delete this job?"
      description={
        hasApplications
          ? undefined
          : `"${job.title}" will be deleted together with its application form and interview templates. This can't be undone.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          {hasApplications && job.status !== "closed" ? (
            <Button variant="secondary" leftIcon={<Lock />} onClick={() => void closeJob()} loading={updateJob.isPending}>
              Close job instead
            </Button>
          ) : null}
          <Button
            variant="danger"
            leftIcon={<Trash2 />}
            onClick={() => void remove()}
            loading={deleteJob.isPending}
            disabled={!confirmed}
          >
            {needsForce ? "Delete job and applications" : "Delete job"}
          </Button>
        </>
      }
    >
      {needsForce ? (
        <div className="space-y-4">
          <Alert tone="danger" title={`This permanently deletes ${applications}`}>
            Their CVs, screening results, HR reviews and AI interviews for this job are removed. Candidate profiles
            are kept. Consider closing the job instead.
          </Alert>
          <FormField label={`Type the job title to confirm: ${job.title}`} htmlFor="delete-job-confirm">
            <Input
              id="delete-job-confirm"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              placeholder={job.title}
            />
          </FormField>
        </div>
      ) : null}
    </Dialog>
  );
}
