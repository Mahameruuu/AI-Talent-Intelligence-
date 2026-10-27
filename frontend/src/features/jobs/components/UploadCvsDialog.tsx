import { useMemo, useState } from "react";
import { Button, Dialog } from "@/components/ui";
import { CvUploader } from "@/features/cv-upload/CvUploader";
import { useInvalidateRecruitingData } from "@/hooks/queries/candidates";
import type { Job } from "@/types/api";

export interface UploadCvsDialogProps {
  open: boolean;
  onClose: () => void;
  job: Pick<Job, "id" | "title">;
}

/**
 * Manual CV upload for one job (secondary to the public application form, e.g. for CVs received
 * by email). Refreshes applicants and related lists when closed.
 */
export function UploadCvsDialog({ open, onClose, job }: UploadCvsDialogProps) {
  const invalidateRecruitingData = useInvalidateRecruitingData();
  const [uploadedCount, setUploadedCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const target = useMemo(() => ({ kind: "job" as const, jobId: job.id }), [job.id]);

  const handleClose = () => {
    if (busy) return;
    // Uploaded files have created applications already, even if processing is still running.
    if (uploadedCount > 0) invalidateRecruitingData();
    setUploadedCount(0);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      size="xl"
      dismissible={!busy}
      title="Add candidates manually"
      description={`Upload CVs you received outside the application form, e.g. by email. Each CV becomes an application for “${job.title}” and is screened against its requirements automatically.`}
      footer={
        <>
          <p className="mr-auto max-w-md text-xs text-slate-500">
            {busy
              ? "Uploading… keep this window open until every file has finished uploading."
              : "Files that finished uploading keep processing on the server after you close this window."}
          </p>
          <Button onClick={handleClose} disabled={busy}>
            {busy ? "Uploading…" : "Done"}
          </Button>
        </>
      }
    >
      <CvUploader target={target} onBusyChange={setBusy} onUploaded={() => setUploadedCount((count) => count + 1)} />
    </Dialog>
  );
}
