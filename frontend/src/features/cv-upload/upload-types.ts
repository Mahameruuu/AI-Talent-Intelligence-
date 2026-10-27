import type { DocumentInfo } from "@/types/api";

export type UploadTarget = { kind: "job"; jobId: number } | { kind: "application"; applicationId: number };

export type UploadPhase = "invalid" | "waiting" | "uploading" | "uploaded" | "upload_failed";

export interface UploadItem {
  localId: string;
  file: File;
  phase: UploadPhase;
  /** 0..1 */
  progress: number;
  error: string | null;
  document: DocumentInfo | null;
}
