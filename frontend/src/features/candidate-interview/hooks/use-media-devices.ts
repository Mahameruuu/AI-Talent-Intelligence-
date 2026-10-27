import { useCallback, useEffect, useRef, useState } from "react";
import {
  classifyMediaError,
  getBrowserMediaDevices,
  isInsecureContext,
  stopStream,
  type MediaDevicesLike,
  type MediaErrorKind,
} from "./media-errors";

const AUDIO_CONSTRAINTS: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  facingMode: "user",
};

export type MediaStatus = "idle" | "requesting" | "ready";

export interface MediaDevicesController {
  /** Local camera + microphone stream. Shown only on this device — never uploaded or recorded. */
  stream: MediaStream | null;
  /** Bumped whenever tracks are added/removed so video elements re-bind. */
  streamVersion: number;
  status: MediaStatus;
  error: MediaErrorKind | null;
  /** The candidate's mic preference (also gates speech recognition). */
  micOn: boolean;
  cameraOn: boolean;
  hasMic: boolean;
  hasCamera: boolean;
  request: () => Promise<void>;
  setMicOn: (on: boolean) => void;
  setCameraOn: (on: boolean) => Promise<void>;
  /** Stop every track (camera light off) — used when leaving the call. */
  stop: () => void;
}

export interface UseMediaDevicesOptions {
  /** Injected for tests; defaults to `navigator.mediaDevices`. */
  devices?: MediaDevicesLike | null;
}

async function tryGetUserMedia(
  devices: MediaDevicesLike,
  constraints: MediaStreamConstraints,
): Promise<{ stream: MediaStream | null; error: MediaErrorKind | null }> {
  try {
    return { stream: await devices.getUserMedia(constraints), error: null };
  } catch (error) {
    return { stream: null, error: classifyMediaError(error) };
  }
}

/** Camera + microphone for the self-view and mic meter. Video stays local; nothing here uploads media. */
export function useMediaDevices(options: UseMediaDevicesOptions = {}): MediaDevicesController {
  const devicesRef = useRef<MediaDevicesLike | null>(
    options.devices === undefined ? getBrowserMediaDevices() : options.devices,
  );
  const streamRef = useRef<MediaStream | null>(null);
  // Incremented by stop()/unmount so late getUserMedia results are discarded (and their tracks stopped).
  const generationRef = useRef(0);
  const micOnRef = useRef(true);
  const cameraOnRef = useRef(true);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [streamVersion, setStreamVersion] = useState(0);
  const [status, setStatus] = useState<MediaStatus>("idle");
  const [error, setError] = useState<MediaErrorKind | null>(null);
  const [micOn, setMicOnState] = useState(true);
  const [cameraOn, setCameraOnState] = useState(true);

  const publish = useCallback((next: MediaStream | null) => {
    streamRef.current = next;
    setStream(next);
    setStreamVersion((version) => version + 1);
  }, []);

  const removeVideoTracks = (target: MediaStream) => {
    for (const track of target.getVideoTracks()) {
      track.stop();
      target.removeTrack(track);
    }
  };

  const request = useCallback(async () => {
    if (isInsecureContext()) {
      setError("insecure");
      return;
    }
    const devices = devicesRef.current;
    if (!devices) {
      setError("unsupported");
      return;
    }
    const generation = generationRef.current;
    stopStream(streamRef.current);
    setStatus("requesting");
    setError(null);

    let next: MediaStream | null = null;
    let failure: MediaErrorKind | null = null;
    const combined = await tryGetUserMedia(devices, { audio: AUDIO_CONSTRAINTS, video: VIDEO_CONSTRAINTS });
    if (combined.stream) {
      next = combined.stream;
    } else {
      failure = combined.error;
      if (failure !== "denied" && failure !== "insecure") {
        // One device may be missing or busy: try each on its own so the other still works.
        const audio = await tryGetUserMedia(devices, { audio: AUDIO_CONSTRAINTS });
        const video = await tryGetUserMedia(devices, { video: VIDEO_CONSTRAINTS });
        next = audio.stream ?? video.stream;
        if (audio.stream && video.stream) {
          video.stream.getVideoTracks().forEach((track) => audio.stream?.addTrack(track));
        }
        failure = audio.error ?? video.error;
      }
    }

    if (generation !== generationRef.current) {
      stopStream(next);
      return;
    }
    if (next) {
      next.getAudioTracks().forEach((track) => {
        track.enabled = micOnRef.current;
      });
      if (!cameraOnRef.current) removeVideoTracks(next);
    }
    publish(next);
    setError(failure);
    setStatus("ready");
  }, [publish]);

  const setMicOn = useCallback((on: boolean) => {
    micOnRef.current = on;
    setMicOnState(on);
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = on;
    });
  }, []);

  const setCameraOn = useCallback(
    async (on: boolean) => {
      cameraOnRef.current = on;
      setCameraOnState(on);
      const current = streamRef.current;
      if (!on) {
        // Really stop the camera (the hardware light goes off), like Meet.
        if (current) {
          removeVideoTracks(current);
          setStreamVersion((version) => version + 1);
        }
        return;
      }
      if (current?.getVideoTracks().some((track) => track.readyState === "live")) return;
      const devices = devicesRef.current;
      if (!devices || isInsecureContext()) {
        setError(devices ? "insecure" : "unsupported");
        cameraOnRef.current = false;
        setCameraOnState(false);
        return;
      }
      const generation = generationRef.current;
      const result = await tryGetUserMedia(devices, { video: VIDEO_CONSTRAINTS });
      if (generation !== generationRef.current || !cameraOnRef.current) {
        stopStream(result.stream);
        return;
      }
      if (!result.stream) {
        setError(result.error);
        cameraOnRef.current = false;
        setCameraOnState(false);
        return;
      }
      setError(null);
      const target = streamRef.current;
      if (target) {
        result.stream.getVideoTracks().forEach((track) => target.addTrack(track));
        setStreamVersion((version) => version + 1);
      } else {
        publish(result.stream);
      }
      setStatus("ready");
    },
    [publish],
  );

  const stop = useCallback(() => {
    generationRef.current += 1;
    stopStream(streamRef.current);
    streamRef.current = null;
    setStream(null);
    setStatus("idle");
  }, []);

  useEffect(() => {
    const onPageHide = () => {
      generationRef.current += 1;
      stopStream(streamRef.current);
    };
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      generationRef.current += 1;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  const hasMic = stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
  const hasCamera = stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;

  return {
    stream,
    streamVersion,
    status,
    error,
    micOn,
    cameraOn,
    hasMic,
    hasCamera,
    request,
    setMicOn,
    setCameraOn,
    stop,
  };
}
