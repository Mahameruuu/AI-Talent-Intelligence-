import { FileWarning, Upload } from "lucide-react";
import { Alert, Button, Progress, Spinner } from "@/components/ui";
import { isDocumentProcessing } from "@/hooks/queries/shared";
import type { DocumentInfo } from "@/types/api";

/** Nominal number of processing steps, used only to draw progress while the CV is read. */
const EXPECTED_STEPS = 11;

/** CV state for the selected application: missing, being processed (live) or failed. */
export function ProcessingBanner({ document, onUpload }: { document: DocumentInfo | null; onUpload: () => void }) {
  if (!document) {
    return (
      <Alert
        tone="info"
        icon={FileWarning}
        title="No CV uploaded for this application"
        action={
          <Button size="sm" variant="secondary" onClick={onUpload} leftIcon={<Upload />}>
            Upload CV
          </Button>
        }
      >
        The profile and screening result appear after a CV is processed.
      </Alert>
    );
  }

  if (isDocumentProcessing(document.status)) {
    const progress = document.status === "queued" ? 4 : Math.min(95, (document.steps.length / EXPECTED_STEPS) * 100);
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-3" role="status" aria-live="polite">
        <div className="flex items-center gap-3">
          <Spinner className="text-sky-600" label="Processing CV" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-sky-900">
              {document.status === "queued" ? "CV queued for processing" : "Reading the CV…"}
            </p>
            <p className="truncate text-xs text-sky-800/80">
              {document.filename} · this page updates by itself; the screening result appears when it's done.
            </p>
          </div>
        </div>
        <Progress value={progress} className="mt-3 bg-sky-100" label="CV processing progress" />
      </div>
    );
  }

  if (document.status === "failed") {
    return (
      <Alert
        tone="danger"
        title="The CV couldn't be read"
        action={
          <Button size="sm" variant="secondary" onClick={onUpload} leftIcon={<Upload />}>
            Upload new CV
          </Button>
        }
      >
        {document.error_message ?? "The document could not be processed."}
      </Alert>
    );
  }

  return null;
}
