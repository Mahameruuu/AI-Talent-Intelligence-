import { FileText, FileUp, UploadCloud, X } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Button, Progress } from "@/components/ui";
import { cn } from "@/utils/cn";
import { CV_ACCEPT_ATTRIBUTE, validateCvFile } from "@/utils/file-validation";
import { formatBytes } from "@/utils/format";

export interface CvDropzoneProps {
  id: string;
  label: string;
  file: File | null;
  /** Called with a file that passed the client-side type/size check, or null when removed. */
  onFileChange: (file: File | null) => void;
  /** Reports client-side rejections (wrong type, too large, empty). */
  onReject: (message: string) => void;
  maxUploadMb: number;
  error?: string;
  /** 0..1 while the application is being uploaded. */
  progress?: number | null;
  disabled?: boolean;
}

/** Single-file CV picker with drag & drop, client-side checks and upload progress (applicant-facing). */
export function CvDropzone({
  id,
  label,
  file,
  onFileChange,
  onReject,
  maxUploadMb,
  error,
  progress,
  disabled,
}: CvDropzoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const uploading = progress !== null && progress !== undefined;

  const pick = (files: FileList | null) => {
    const next = files?.[0];
    if (!next) return;
    const problem = validateCvFile(next, maxUploadMb * 1024 * 1024);
    if (problem) onReject(problem);
    else onFileChange(next);
  };

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    if (!disabled) pick(event.dataTransfer.files);
  };

  return (
    <div data-field-id="cv" className="scroll-mt-24 space-y-1.5">
      <p className="text-[15px] font-medium text-slate-800" id={`${id}-label`}>
        {label}
        <span className="ml-0.5 text-rose-600" aria-hidden>
          *
        </span>
      </p>

      {file ? (
        <div className={cn("rounded-xl border bg-white px-4 py-3", error ? "border-rose-300" : "border-slate-200")}>
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
              <FileText className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-slate-500">
                {formatBytes(file.size)}
                {uploading ? ` · Uploading ${Math.round((progress ?? 0) * 100)}%` : ""}
              </p>
            </div>
            {!uploading && !disabled ? (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onFileChange(null)}
                aria-label={`Remove ${file.name}`}
              >
                <X />
              </Button>
            ) : null}
          </div>
          {uploading ? <Progress value={(progress ?? 0) * 100} className="mt-3" label="CV upload progress" /> : null}
        </div>
      ) : (
        <label
          htmlFor={id}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
            disabled
              ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-70"
              : dragActive
                ? "cursor-copy border-indigo-500 bg-indigo-50/60"
                : error
                  ? "cursor-pointer border-rose-300 bg-rose-50/30 hover:border-rose-400"
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
              {dragActive ? "Drop your CV here" : "Drag & drop your CV here, or tap to choose a file"}
            </p>
            <p id={hintId} className="mt-1 text-xs text-slate-500">
              PDF or DOCX · max {maxUploadMb} MB
            </p>
          </div>
        </label>
      )}

      {/* Kept mounted so the label (and "Replace") can open the picker. */}
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={CV_ACCEPT_ATTRIBUTE}
        disabled={disabled || uploading}
        aria-labelledby={`${id}-label`}
        aria-describedby={[hintId, error ? errorId : null].filter(Boolean).join(" ")}
        aria-invalid={error ? true : undefined}
        aria-required
        onChange={(event) => {
          pick(event.target.files);
          event.target.value = "";
        }}
      />

      {error ? (
        <p id={errorId} className="text-sm font-medium text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
