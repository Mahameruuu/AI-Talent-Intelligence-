import { FileUp, UploadCloud } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from "react";
import { getErrorMessage } from "@/services/api-client";
import { candidatesApi } from "@/services/candidates-api";
import { documentsApi } from "@/services/screening-api";
import type { DocumentInfo } from "@/types/api";
import { cn } from "@/utils/cn";
import { CV_ACCEPT_ATTRIBUTE, validateCvFile } from "@/utils/file-validation";
import { UploadList } from "./UploadList";
import type { UploadItem, UploadTarget } from "./upload-types";

const MAX_CONCURRENT_UPLOADS = 3;

export interface CvUploaderProps {
  /** Where files go. `null` disables the drop zone (e.g. no job selected yet). */
  target: UploadTarget | null;
  disabledReason?: string;
  multiple?: boolean;
  /** Called once per file when the upload request succeeds (processing continues server-side). */
  onUploaded?: (document: DocumentInfo) => void;
  /** Reports whether files are still waiting/uploading (unmounting cancels in-flight uploads). */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}

let localCounter = 0;
function nextLocalId(): string {
  localCounter += 1;
  return `upload-${Date.now()}-${localCounter}`;
}

/**
 * Drag & drop CV uploader. Validates type/size client-side, uploads with real progress
 * (max 3 in parallel) and then polls each document's NLP status until it finishes.
 */
export function CvUploader({ target, disabledReason, multiple = true, onUploaded, onBusyChange, className }: CvUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const queue = useRef<{ item: UploadItem; target: UploadTarget }[]>([]);
  const active = useRef(0);
  const controllers = useRef(new Map<string, AbortController>());
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;

  const busy = items.some((item) => item.phase === "waiting" || item.phase === "uploading");
  useEffect(() => {
    onBusyChangeRef.current?.(busy);
    if (!busy) return;
    // Warn before closing the tab while files are still uploading.
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  useEffect(() => {
    const registry = controllers.current;
    return () => {
      registry.forEach((controller) => controller.abort());
      registry.clear();
    };
  }, []);

  const patchItem = useCallback((localId: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  }, []);

  const runUpload = useCallback(
    async (item: UploadItem, uploadTarget: UploadTarget) => {
      const controller = new AbortController();
      controllers.current.set(item.localId, controller);
      patchItem(item.localId, { phase: "uploading", progress: 0, error: null });
      const onProgress = (fraction: number) => patchItem(item.localId, { progress: fraction });
      try {
        const document =
          uploadTarget.kind === "job"
            ? (await candidatesApi.upload(item.file, uploadTarget.jobId, onProgress, controller.signal)).document
            : await documentsApi.upload(uploadTarget.applicationId, item.file, onProgress, controller.signal);
        patchItem(item.localId, { phase: "uploaded", progress: 1, document });
        onUploadedRef.current?.(document);
      } catch (error) {
        if (controller.signal.aborted) return;
        patchItem(item.localId, { phase: "upload_failed", error: getErrorMessage(error, "Upload failed.") });
      } finally {
        controllers.current.delete(item.localId);
      }
    },
    [patchItem],
  );

  const pump = useCallback(() => {
    while (active.current < MAX_CONCURRENT_UPLOADS && queue.current.length > 0) {
      const next = queue.current.shift();
      if (!next) break;
      active.current += 1;
      void runUpload(next.item, next.target).finally(() => {
        active.current -= 1;
        pump();
      });
    }
  }, [runUpload]);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      if (!target) return;
      const files = Array.from(fileList).slice(0, multiple ? undefined : 1);
      const created: UploadItem[] = files.map((file) => {
        const error = validateCvFile(file);
        return {
          localId: nextLocalId(),
          file,
          phase: error ? "invalid" : "waiting",
          progress: 0,
          error,
          document: null,
        };
      });
      setItems((current) => [...created, ...current]);
      for (const item of created) {
        if (item.phase === "waiting") queue.current.push({ item, target });
      }
      pump();
    },
    [target, multiple, pump],
  );

  const retry = useCallback(
    (localId: string) => {
      if (!target) return;
      const item = items.find((entry) => entry.localId === localId);
      if (!item) return;
      patchItem(localId, { phase: "waiting", error: null, progress: 0 });
      queue.current.push({ item, target });
      pump();
    },
    [items, target, patchItem, pump],
  );

  const remove = useCallback((localId: string) => {
    controllers.current.get(localId)?.abort();
    setItems((current) => current.filter((item) => item.localId !== localId));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((current) => current.filter((item) => item.phase === "uploading" || item.phase === "waiting"));
  }, []);

  const disabled = target === null;

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (disabled) return;
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          disabled
            ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
            : dragActive
              ? "cursor-copy border-indigo-500 bg-indigo-50/60"
              : "cursor-pointer border-slate-300 bg-white hover:border-indigo-400 hover:bg-indigo-50/30",
          "focus-within:ring-3 focus-within:ring-indigo-500/20",
        )}
      >
        <div
          className={cn(
            "flex size-12 items-center justify-center rounded-full",
            dragActive ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500",
          )}
        >
          {dragActive ? <FileUp className="size-6" aria-hidden /> : <UploadCloud className="size-6" aria-hidden />}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {disabled ? (disabledReason ?? "Uploads are unavailable") : dragActive ? "Drop to upload" : multiple ? "Drag & drop CVs here, or click to browse" : "Drag & drop a CV here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-slate-500">PDF or DOCX · max 10 MB per file{multiple ? " · multiple files allowed" : ""}</p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          className="sr-only"
          accept={CV_ACCEPT_ATTRIBUTE}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </label>

      {items.length > 0 ? (
        <UploadList items={items} onRetry={retry} onRemove={remove} onClearFinished={clearFinished} />
      ) : null}
    </div>
  );
}
