import { CheckCircle2, ExternalLink, FileText, RotateCcw, X, XCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { Button, Progress, StatusBadge } from "@/components/ui";
import { useInvalidateRecruitingData } from "@/hooks/queries/candidates";
import { useDocumentStatus } from "@/hooks/queries/screening";
import { isDocumentProcessing } from "@/hooks/queries/shared";
import type { DocumentInfo } from "@/types/api";
import { formatBytes, formatDuration } from "@/utils/format";
import { PIPELINE_STEP_LABELS } from "@/utils/labels";
import type { UploadItem } from "./upload-types";

export interface UploadListProps {
  items: UploadItem[];
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
  onClearFinished: () => void;
}

export function UploadList({ items, onRetry, onRemove, onClearFinished }: UploadListProps) {
  const uploading = items.filter((item) => item.phase === "uploading" || item.phase === "waiting").length;
  const rejected = items.filter((item) => item.phase === "invalid" || item.phase === "upload_failed").length;
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5">
        <p className="text-xs font-medium text-slate-600">
          {items.length} {items.length === 1 ? "file" : "files"}
          {uploading > 0 ? ` · ${uploading} uploading` : ""}
          {rejected > 0 ? ` · ${rejected} not uploaded` : ""}
        </p>
        <Button variant="ghost" size="sm" onClick={onClearFinished} disabled={uploading === items.length}>
          Clear finished
        </Button>
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <UploadRow key={item.localId} item={item} onRetry={onRetry} onRemove={onRemove} />
        ))}
      </ul>
    </div>
  );
}

function UploadRow({
  item,
  onRetry,
  onRemove,
}: {
  item: UploadItem;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
}) {
  return (
    <li className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <FileText className="size-4.5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900" title={item.file.name}>
            {item.file.name}
          </p>
          <p className="text-xs text-slate-500">{formatBytes(item.file.size)}</p>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3 sm:w-[22rem] sm:justify-end">
        {item.phase === "invalid" ? (
          <RowError message={item.error ?? "File not accepted."} />
        ) : item.phase === "upload_failed" ? (
          <>
            <RowError message={item.error ?? "Upload failed."} />
            <Button variant="secondary" size="sm" onClick={() => onRetry(item.localId)} leftIcon={<RotateCcw />}>
              Retry
            </Button>
          </>
        ) : item.phase === "waiting" ? (
          <span className="text-xs text-slate-500">Waiting…</span>
        ) : item.phase === "uploading" ? (
          <div className="w-full max-w-56 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Uploading</span>
              <span className="tabular-nums">{Math.round(item.progress * 100)}%</span>
            </div>
            <Progress value={item.progress * 100} label={`Uploading ${item.file.name}`} />
          </div>
        ) : item.document ? (
          <ProcessingStatus initial={item.document} />
        ) : null}
        {item.phase !== "uploading" && item.phase !== "waiting" ? (
          <Button variant="ghost" size="icon-sm" onClick={() => onRemove(item.localId)} aria-label={`Remove ${item.file.name} from list`}>
            <X />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function RowError({ message }: { message: string }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-rose-700">
      <XCircle className="size-4 shrink-0" aria-hidden />
      <span className="truncate" title={message}>
        {message}
      </span>
    </span>
  );
}

/** Polls the document's NLP status and links to the candidate once processed. */
function ProcessingStatus({ initial }: { initial: DocumentInfo }) {
  const statusQuery = useDocumentStatus(initial.id, { enabled: isDocumentProcessing(initial.status) });
  const document = statusQuery.data ?? initial;
  const invalidate = useInvalidateRecruitingData();
  const notified = useRef(false);

  useEffect(() => {
    if (!isDocumentProcessing(document.status) && !notified.current) {
      notified.current = true;
      invalidate();
    }
  }, [document.status, invalidate]);

  const currentStep = document.steps.length > 0 ? document.steps[document.steps.length - 1] : undefined;
  const candidateLink = `/candidates/${document.candidate_id}?application=${document.application_id}`;

  return (
    <div className="flex min-w-0 flex-wrap items-center justify-end gap-2" aria-live="polite">
      <StatusBadge kind="document" value={document.status} />
      {isDocumentProcessing(document.status) && currentStep ? (
        <span className="truncate text-xs text-slate-500">
          {PIPELINE_STEP_LABELS[currentStep.name] ?? currentStep.name}
        </span>
      ) : null}
      {document.status === "completed" ? (
        <>
          <span className="hidden items-center gap-1 text-xs text-slate-500 md:inline-flex">
            <CheckCircle2 className="size-3.5 text-emerald-600" aria-hidden />
            {formatDuration(document.processing_ms)}
          </span>
          <Link to={candidateLink} className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 hover:underline">
            View candidate
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        </>
      ) : null}
      {document.status === "failed" ? (
        <>
          <span className="max-w-48 truncate text-xs text-rose-700" title={document.error_message ?? undefined}>
            {document.error_message ?? document.error_code ?? "Processing failed"}
          </span>
          <Link to={candidateLink} className="text-xs font-semibold text-indigo-700 hover:underline">
            Details
          </Link>
        </>
      ) : null}
    </div>
  );
}
