import { useCallback, useEffect, useRef, useState } from "react";
import { classifyMediaError, getBrowserMediaDevices, stopStream, type MediaDevicesLike, type MediaErrorKind } from "./media-errors";

export interface ScreenShareController {
  /** False on most mobile browsers (no getDisplayMedia). */
  supported: boolean;
  /** The shared screen — previewed locally only, never uploaded or recorded. */
  stream: MediaStream | null;
  sharing: boolean;
  error: MediaErrorKind | null;
  start: () => Promise<void>;
  stop: () => void;
}

export interface UseScreenShareOptions {
  devices?: MediaDevicesLike | null;
}

export function useScreenShare(options: UseScreenShareOptions = {}): ScreenShareController {
  const devicesRef = useRef<MediaDevicesLike | null>(
    options.devices === undefined ? getBrowserMediaDevices() : options.devices,
  );
  const streamRef = useRef<MediaStream | null>(null);
  const detachRef = useRef<(() => void) | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<MediaErrorKind | null>(null);

  const supported = typeof devicesRef.current?.getDisplayMedia === "function";

  const stop = useCallback(() => {
    detachRef.current?.();
    detachRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
  }, []);

  const start = useCallback(async () => {
    const devices = devicesRef.current;
    if (!devices?.getDisplayMedia) {
      setError("unsupported");
      return;
    }
    setError(null);
    let next: MediaStream;
    try {
      next = await devices.getDisplayMedia({ video: true, audio: false });
    } catch (caught) {
      const kind = classifyMediaError(caught);
      // Cancelling the browser's picker is a normal choice, not an error worth shouting about.
      setError(kind === "denied" ? null : kind);
      return;
    }
    stop();
    // The browser's own "Stop sharing" button ends the track: leave the shared-screen layout.
    const onEnded = () => stop();
    const tracks = next.getVideoTracks();
    tracks.forEach((track) => track.addEventListener("ended", onEnded));
    detachRef.current = () => tracks.forEach((track) => track.removeEventListener("ended", onEnded));
    streamRef.current = next;
    setStream(next);
  }, [stop]);

  useEffect(() => {
    window.addEventListener("pagehide", stop);
    return () => {
      window.removeEventListener("pagehide", stop);
      detachRef.current?.();
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [stop]);

  return { supported, stream, sharing: stream !== null, error, start, stop };
}
