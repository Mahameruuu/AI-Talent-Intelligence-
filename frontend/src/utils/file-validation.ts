export const MAX_CV_SIZE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_CV_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const ACCEPTED_CV_EXTENSIONS = [".pdf", ".docx"] as const;

/** `accept` attribute for file inputs. */
export const CV_ACCEPT_ATTRIBUTE = [...ACCEPTED_CV_EXTENSIONS, ...ACCEPTED_CV_MIME_TYPES].join(",");

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? String(mb) : mb.toFixed(1);
}

/** Returns a human-readable reason when the file cannot be uploaded, otherwise null. */
export function validateCvFile(
  file: Pick<File, "name" | "size" | "type">,
  maxBytes: number = MAX_CV_SIZE_BYTES,
): string | null {
  const lowerName = file.name.toLowerCase();
  const extensionOk = ACCEPTED_CV_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  const mimeOk = file.type === "" || (ACCEPTED_CV_MIME_TYPES as readonly string[]).includes(file.type);
  if (!extensionOk || !mimeOk) return "Only PDF or DOCX files are supported.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > maxBytes) return `File is larger than ${formatMegabytes(maxBytes)} MB.`;
  return null;
}
