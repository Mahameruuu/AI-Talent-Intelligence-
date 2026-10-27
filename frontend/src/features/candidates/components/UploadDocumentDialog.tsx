import { useState } from "react";
import { Button, Dialog } from "@/components/ui";
import { CvUploader } from "@/features/cv-upload/CvUploader";
import type { DocumentInfo } from "@/types/api";

export interface UploadDocumentDialogProps {
  open: boolean;
  onClose: () => void;
  applicationId: number;
  jobTitle: string;
  onUploaded: (document: DocumentInfo) => void;
}

/** Upload a new CV version to an existing application (POST /applications/{id}/documents). */
export function UploadDocumentDialog({ open, onClose, applicationId, jobTitle, onUploaded }: UploadDocumentDialogProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Upload a new CV version"
      description={`For the ${jobTitle} application. The new CV is processed and the job match is recalculated; earlier versions stay in the document history. Uploading the same file again reuses the existing document.`}
      footer={
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {busy ? "Uploading…" : "Done"}
        </Button>
      }
    >
      <CvUploader target={{ kind: "application", applicationId }} multiple={false} onUploaded={onUploaded} onBusyChange={setBusy} />
    </Dialog>
  );
}
