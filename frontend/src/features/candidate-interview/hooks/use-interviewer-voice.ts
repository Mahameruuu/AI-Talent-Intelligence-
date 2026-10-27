import { useCallback, useEffect, useRef, useState } from "react";
import { useSpeechSynthesis, type SpeechSynthesisLike, type UtteranceFactory } from "./use-speech-synthesis";

/**
 * An interviewer message to read aloud. `messageId` selects the server audio; `key` identifies the turn.
 * `ackIndex` instead selects a pre-generated acknowledgement clip (conversational mode).
 */
export interface InterviewerMessage {
  key: string;
  text: string;
  messageId: number | null;
  ackIndex?: number;
}

export type FetchMessageAudio = (messageId: number, signal: AbortSignal) => Promise<Blob>;
/** Acknowledgement clip by 0-based index into `acknowledgements`. */
export type FetchAckAudio = (index: number, signal: AbortSignal) => Promise<Blob>;

/** 5 ms of silence: played inside the Join click so later programmatic playback is allowed (Safari/Chrome autoplay). */
export const SILENT_WAV =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YVAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

/** After this many consecutive server-audio failures, use the browser voice for the rest of the session. */
export const MAX_SERVER_FAILURES = 2;
const MAX_CACHED_CLIPS = 8;

let sharedAudio: HTMLAudioElement | null = null;

/** The ONE persistent audio element used for the interviewer (an element unlocked once stays playable). */
export function getInterviewerAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof window.Audio !== "function") return null;
  if (!sharedAudio) {
    sharedAudio = new window.Audio();
    sharedAudio.preload = "auto";
  }
  return sharedAudio;
}

/** Must run synchronously inside a user gesture (the Join click). Failures are harmless. */
export function unlockInterviewerAudio(audio: HTMLAudioElement | null = getInterviewerAudio()): void {
  if (!audio) return;
  try {
    audio.muted = false;
    audio.src = SILENT_WAV;
    const played: Promise<void> | undefined = audio.play();
    if (played) void played.catch(() => undefined);
  } catch {
    // Old engines throw synchronously; the browser voice remains as a fallback.
  }
}

function canCreateObjectUrl(): boolean {
  return typeof URL !== "undefined" && typeof URL.createObjectURL === "function";
}

export interface UseInterviewerVoiceOptions {
  /** BCP-47 tag for the browser fallback, e.g. "id-ID". */
  lang: string;
  /** `voice.server_tts` from the interview state. */
  serverTts: boolean;
  fetchAudio: FetchMessageAudio | null;
  /** Acknowledgement clips (conversational mode); without it acknowledgements use the browser voice. */
  fetchAckAudio?: FetchAckAudio | null;
  /** Give up on a server clip after this long and use the browser voice. */
  fetchTimeoutMs?: number;
  /** Injection points for tests. */
  audio?: HTMLAudioElement | null;
  synth?: SpeechSynthesisLike | null;
  createUtterance?: UtteranceFactory | null;
}

export interface InterviewerVoiceController {
  supported: boolean;
  /** True from `speak()` until the audio ends, including while the clip is being fetched. */
  speaking: boolean;
  /** Fetching the interviewer's audio (shown as "preparing"). */
  preparing: boolean;
  /** Neither server audio nor a browser voice for the language: questions are captions only. */
  noVoiceForLang: boolean;
  /** Server audio is in use for this session. */
  serverAudio: boolean;
  /**
   * Read a message aloud. `onEnd` runs exactly once: when it has been read, couldn't be read, or was
   * cancelled / replaced by another `speak()`.
   */
  speak: (message: InterviewerMessage, onEnd?: () => void) => void;
  prefetch: (message: InterviewerMessage) => void;
  cancel: () => void;
  unlock: () => void;
}

type Phase = "idle" | "preparing" | "playing";

/**
 * The interviewer's voice: server text-to-speech clips (natural Indonesian voice, any browser) played through one
 * persistent audio element, falling back to the browser's speech synthesis when a clip can't be fetched or played.
 */
export function useInterviewerVoice(options: UseInterviewerVoiceOptions): InterviewerVoiceController {
  const { lang, serverTts, fetchAudio, fetchAckAudio = null, fetchTimeoutMs = 25000 } = options;
  const [audio] = useState<HTMLAudioElement | null>(() =>
    options.audio === undefined ? getInterviewerAudio() : options.audio,
  );
  const browser = useSpeechSynthesis({ lang, synth: options.synth, createUtterance: options.createUtterance });

  const [phase, setPhase] = useState<Phase>("idle");
  const [serverDisabled, setServerDisabled] = useState(false);
  const tokenRef = useRef(0);
  const failuresRef = useRef(0);
  const clipsRef = useRef(new Map<number, Promise<Blob>>());
  // Only a handful of acknowledgements exist and they repeat: keep them for the whole session.
  const ackClipsRef = useRef(new Map<number, Promise<Blob>>());
  const endRef = useRef<(() => void) | null>(null);
  const urlRef = useRef<string | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const serverActive = serverTts && !serverDisabled && fetchAudio !== null && audio !== null && canCreateObjectUrl();
  const serverActiveRef = useRef(serverActive);
  useEffect(() => {
    serverActiveRef.current = serverActive;
  }, [serverActive]);

  const clearWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  };

  const load = useCallback(
    (messageId: number): Promise<Blob> => {
      const clips = clipsRef.current;
      const existing = clips.get(messageId);
      if (existing) return existing;
      if (!fetchAudio) return Promise.reject(new Error("No audio source"));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
      const clip = fetchAudio(messageId, controller.signal).finally(() => clearTimeout(timer));
      clips.set(messageId, clip);
      // A failed clip may be retried later (e.g. "repeat"); keep only the most recent clips.
      clip.catch(() => {
        if (clips.get(messageId) === clip) clips.delete(messageId);
      });
      while (clips.size > MAX_CACHED_CLIPS) {
        const oldest = clips.keys().next().value;
        if (oldest === undefined) break;
        clips.delete(oldest);
      }
      return clip;
    },
    [fetchAudio, fetchTimeoutMs],
  );

  const loadAck = useCallback(
    (index: number): Promise<Blob> => {
      const clips = ackClipsRef.current;
      const existing = clips.get(index);
      if (existing) return existing;
      if (!fetchAckAudio) return Promise.reject(new Error("No audio source"));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), fetchTimeoutMs);
      const clip = fetchAckAudio(index, controller.signal).finally(() => clearTimeout(timer));
      clips.set(index, clip);
      clip.catch(() => {
        if (clips.get(index) === clip) clips.delete(index);
      });
      return clip;
    },
    [fetchAckAudio, fetchTimeoutMs],
  );

  /** The server clip for a message, or null when it must be read by the browser voice. */
  const clipFor = useCallback(
    (message: InterviewerMessage): Promise<Blob> | null => {
      if (!serverActiveRef.current) return null;
      if (message.ackIndex !== undefined) return fetchAckAudio ? loadAck(message.ackIndex) : null;
      return message.messageId === null ? null : load(message.messageId);
    },
    [fetchAckAudio, load, loadAck],
  );

  const prefetch = useCallback(
    (message: InterviewerMessage) => {
      void clipFor(message)?.catch(() => undefined);
    },
    [clipFor],
  );

  /** Settle the pending `onEnd` of the previous `speak()` (finished, cancelled or replaced). */
  const flushEnd = useCallback(() => {
    const onEnd = endRef.current;
    endRef.current = null;
    onEnd?.();
  }, []);

  const { speak: browserSpeak, cancel: browserCancel } = browser;

  const stopAudio = useCallback(() => {
    clearWatchdog();
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
  }, [audio]);

  const speak = useCallback(
    (message: InterviewerMessage, onEnd?: () => void) => {
      const token = ++tokenRef.current;
      flushEnd();
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        if (endRef.current === done) endRef.current = null;
        onEnd?.();
      };
      endRef.current = done;
      stopAudio();
      browserCancel();
      const clip = audio ? clipFor(message) : null;
      if (!clip || !audio) {
        setPhase("idle");
        browserSpeak(message.text, done);
        return;
      }
      setPhase("preparing");

      const finish = () => {
        if (token !== tokenRef.current) return;
        clearWatchdog();
        setPhase("idle");
        done();
      };
      let failed = false;
      const fallback = () => {
        // `error` and a rejected play() can both report the same failure.
        if (token !== tokenRef.current || failed) return;
        failed = true;
        stopAudio();
        failuresRef.current += 1;
        if (failuresRef.current >= MAX_SERVER_FAILURES) setServerDisabled(true);
        setPhase("idle");
        browserSpeak(message.text, done);
      };

      clip
        .then((blob) => {
          if (token !== tokenRef.current) return;
          const url = URL.createObjectURL(blob);
          const previous = urlRef.current;
          urlRef.current = url;
          audio.onended = finish;
          audio.onerror = fallback;
          audio.muted = false;
          audio.src = url;
          if (previous) URL.revokeObjectURL(previous);
          setPhase("playing");
          const played: Promise<void> | undefined = audio.play();
          return played?.then(() => {
            if (token !== tokenRef.current) return;
            failuresRef.current = 0;
            // Some engines never fire `ended`; don't leave the candidate waiting forever.
            const seconds = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : message.text.split(/\s+/).length / 2;
            clearWatchdog();
            watchdogRef.current = setTimeout(finish, seconds * 1000 + 5000);
          });
        })
        .catch(fallback);
    },
    [audio, browserCancel, browserSpeak, clipFor, flushEnd, stopAudio],
  );

  const cancel = useCallback(() => {
    tokenRef.current += 1;
    stopAudio();
    setPhase("idle");
    browserCancel();
    flushEnd();
  }, [browserCancel, flushEnd, stopAudio]);

  const unlock = useCallback(() => unlockInterviewerAudio(audio), [audio]);

  useEffect(() => {
    window.addEventListener("pagehide", cancel);
    return () => window.removeEventListener("pagehide", cancel);
  }, [cancel]);

  useEffect(
    () => () => {
      tokenRef.current += 1;
      stopAudio();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    },
    [stopAudio],
  );

  return {
    supported: serverActive || browser.supported,
    speaking: phase !== "idle" || browser.speaking,
    preparing: phase === "preparing",
    noVoiceForLang: browser.noVoiceForLang && !serverActive,
    serverAudio: serverActive,
    speak,
    prefetch,
    cancel,
    unlock,
  };
}
