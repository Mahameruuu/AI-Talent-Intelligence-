/** Why a camera / microphone / screen request failed, mapped from DOMException names. */
export type MediaErrorKind = "denied" | "not-found" | "in-use" | "insecure" | "unsupported" | "unknown";

export function classifyMediaError(error: unknown): MediaErrorKind {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "denied";
  if (name === "SecurityError") return "insecure";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "not-found";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "in-use";
  if (name === "TypeError" || name === "NotSupportedError") return "unsupported";
  return "unknown";
}

/** Minimal surface of `navigator.mediaDevices` the interview uses (injectable for tests). */
export interface MediaDevicesLike {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  getDisplayMedia?(options?: DisplayMediaStreamOptions): Promise<MediaStream>;
}

export function getBrowserMediaDevices(): MediaDevicesLike | null {
  if (typeof navigator === "undefined") return null;
  const devices = (navigator as Navigator & { mediaDevices?: MediaDevices }).mediaDevices;
  return devices && typeof devices.getUserMedia === "function" ? devices : null;
}

export function isInsecureContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === false;
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}
