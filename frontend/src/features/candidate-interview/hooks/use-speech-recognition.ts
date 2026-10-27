import { useCallback, useEffect, useRef, useState } from "react";

// ---- Minimal typings for the (prefixed) Web Speech API; not all TS DOM libs ship them. ----

export interface SpeechRecognitionAlternativeLike {
  readonly transcript: string;
  readonly confidence: number;
}

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: SpeechRecognitionAlternativeLike;
}

export interface SpeechRecognitionResultListLike {
  readonly length: number;
  readonly [index: number]: SpeechRecognitionResultLike;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultListLike;
}

export interface SpeechRecognitionErrorEventLike {
  /** "not-allowed" | "service-not-allowed" | "no-speech" | "aborted" | "audio-capture" | "network" | … */
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Why recognition can't be used in this session: the room falls back to typing. */
export type RecognitionBlock = "unsupported" | "denied" | "network";

export interface UseSpeechRecognitionOptions {
  lang: string;
  /** Called with each finalised phrase; the caller appends it to the editable answer. */
  onFinalResult: (text: string) => void;
  /** Injected for tests; defaults to SpeechRecognition / webkitSpeechRecognition. */
  Recognition?: SpeechRecognitionConstructor | null;
  restartDelayMs?: number;
}

export interface SpeechRecognitionController {
  supported: boolean;
  /** Set once recognition proved unusable (permission denied, service unavailable). */
  blocked: RecognitionBlock | null;
  listening: boolean;
  /** Not-yet-final words of the current phrase. */
  interim: string;
  /** Start listening; auto-restarts after the engine's own `end` until stop()/abort(). */
  start: () => void;
  /** Stop listening, keeping any final result still in flight. */
  stop: () => void;
  /** Stop immediately and discard pending results (e.g. the answer was just submitted). */
  abort: () => void;
}

const FATAL_ERRORS: Record<string, RecognitionBlock> = {
  "not-allowed": "denied",
  "service-not-allowed": "denied",
  "audio-capture": "denied",
  network: "network",
  "language-not-supported": "unsupported",
};

/** Candidate voice answers via the browser's speech recognition (Chrome/Edge sends audio to their speech service). */
export function useSpeechRecognition(options: UseSpeechRecognitionOptions): SpeechRecognitionController {
  const { lang, restartDelayMs = 250 } = options;
  const CtorRef = useRef<SpeechRecognitionConstructor | null>(
    options.Recognition === undefined ? getSpeechRecognitionConstructor() : options.Recognition,
  );
  const onFinalRef = useRef(options.onFinalResult);
  useEffect(() => {
    onFinalRef.current = options.onFinalResult;
  });

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const ignoreRef = useRef(false);
  const runningRef = useRef(false);
  const blockedRef = useRef<RecognitionBlock | null>(null);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [blocked, setBlocked] = useState<RecognitionBlock | null>(null);

  const supported = CtorRef.current !== null;

  const clearRestart = () => {
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    restartTimerRef.current = null;
  };

  const block = (reason: RecognitionBlock) => {
    blockedRef.current = reason;
    wantRef.current = false;
    setBlocked(reason);
  };

  const getRecognition = useCallback((): SpeechRecognitionLike | null => {
    if (recognitionRef.current) return recognitionRef.current;
    const Ctor = CtorRef.current;
    if (!Ctor) return null;
    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Ctor();
    } catch {
      block("unsupported");
      return null;
    }
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      runningRef.current = true;
      setListening(true);
    };
    recognition.onresult = (event) => {
      if (ignoreRef.current) return;
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? "";
        if (!result || !transcript) continue;
        if (result.isFinal) {
          const text = transcript.trim();
          if (text) onFinalRef.current(text);
        } else {
          pending += transcript;
        }
      }
      setInterim(pending.trim());
    };
    recognition.onerror = (event) => {
      const fatal = FATAL_ERRORS[event.error];
      if (fatal) block(fatal);
      // "no-speech" / "aborted" are routine: `onend` follows and we restart if still wanted.
    };
    recognition.onend = () => {
      runningRef.current = false;
      setInterim("");
      if (wantRef.current && !blockedRef.current) {
        clearRestart();
        restartTimerRef.current = setTimeout(() => {
          restartTimerRef.current = null;
          if (!wantRef.current || runningRef.current) return;
          try {
            recognition.start();
            runningRef.current = true;
          } catch {
            // Already started: nothing to do.
          }
        }, restartDelayMs);
        return;
      }
      setListening(false);
    };
    recognitionRef.current = recognition;
    return recognition;
  }, [restartDelayMs]);

  const start = useCallback(() => {
    if (blockedRef.current) return;
    const recognition = getRecognition();
    if (!recognition) return;
    recognition.lang = lang;
    wantRef.current = true;
    ignoreRef.current = false;
    if (runningRef.current) return;
    clearRestart();
    try {
      recognition.start();
      runningRef.current = true;
      setListening(true);
    } catch {
      // InvalidStateError: already running.
    }
  }, [getRecognition, lang]);

  const stop = useCallback(() => {
    wantRef.current = false;
    clearRestart();
    setListening(false);
    if (runningRef.current) recognitionRef.current?.stop();
  }, []);

  const abort = useCallback(() => {
    wantRef.current = false;
    ignoreRef.current = true;
    clearRestart();
    setInterim("");
    setListening(false);
    if (runningRef.current) recognitionRef.current?.abort();
    runningRef.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", abort);
    return () => {
      window.removeEventListener("pagehide", abort);
      wantRef.current = false;
      clearRestart();
      const recognition = recognitionRef.current;
      if (recognition) {
        recognition.onresult = null;
        recognition.onend = null;
        recognition.onerror = null;
        recognition.onstart = null;
        recognition.abort();
      }
      recognitionRef.current = null;
      runningRef.current = false;
    };
  }, [abort]);

  return { supported, blocked: supported ? blocked : "unsupported", listening, interim, start, stop, abort };
}
