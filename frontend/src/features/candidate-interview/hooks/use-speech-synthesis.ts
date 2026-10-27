import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal `window.speechSynthesis` surface (injectable for tests). */
export interface SpeechSynthesisLike {
  speak(utterance: SpeechSynthesisUtterance): void;
  cancel(): void;
  resume?(): void;
  getVoices(): SpeechSynthesisVoice[];
  addEventListener(type: "voiceschanged", listener: () => void): void;
  removeEventListener(type: "voiceschanged", listener: () => void): void;
}

export type UtteranceFactory = (text: string) => SpeechSynthesisUtterance;

export interface UseSpeechSynthesisOptions {
  /** BCP-47 tag such as "id-ID". */
  lang: string;
  synth?: SpeechSynthesisLike | null;
  createUtterance?: UtteranceFactory | null;
  /** How long to wait for `voiceschanged` before speaking with whatever is available. */
  voicesTimeoutMs?: number;
  /** Pause between `cancel()` and `speak()`: Chrome silently drops an utterance queued right after cancel. */
  cancelDelayMs?: number;
}

export interface SpeechSynthesisController {
  supported: boolean;
  /** True from `speak()` until the last chunk ends (including while voices load). */
  speaking: boolean;
  /** The voice used for the last utterance, if any. */
  voice: SpeechSynthesisVoice | null;
  /** The browser has voices, but none for `lang`: questions are shown as captions only. */
  noVoiceForLang: boolean;
  /** `onEnd` runs once the text has been read (or couldn't be); not when it is cancelled or superseded. */
  speak: (text: string, onEnd?: () => void) => void;
  cancel: () => void;
}

/** Normalise "id_ID" / legacy "in-ID" to "id-id" for comparison. */
export function normalizeLang(tag: string): string {
  const lower = tag.trim().replace(/_/g, "-").toLowerCase();
  if (lower === "in" || lower.startsWith("in-")) return `id${lower.slice(2)}`;
  return lower;
}

/** Best voice for `lang`: exact region match first, then same language; prefers higher-quality voices. */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const target = normalizeLang(lang);
  const base = target.split("-")[0];
  const exact = voices.filter((voice) => normalizeLang(voice.lang) === target);
  const pool = exact.length > 0 ? exact : voices.filter((voice) => normalizeLang(voice.lang).split("-")[0] === base);
  if (pool.length === 0) return null;
  return (
    pool.find((voice) => /google|natural|online|neural/i.test(voice.name)) ??
    pool.find((voice) => voice.default) ??
    pool[0] ??
    null
  );
}

/** Split long text into sentence groups: Chrome cuts single utterances off after ~15 seconds. */
export function splitForSpeech(text: string, maxLength = 220): string[] {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^.!?…]+[.!?…]*\s*/g);
  if (!sentences) return text.trim() ? [text.trim()] : [];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && current.length + sentence.length > maxLength) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function browserSynth(): SpeechSynthesisLike | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  return window.speechSynthesis ?? null;
}

function browserUtteranceFactory(): UtteranceFactory | null {
  if (typeof window === "undefined" || typeof window.SpeechSynthesisUtterance !== "function") return null;
  const Ctor = window.SpeechSynthesisUtterance;
  return (text) => new Ctor(text);
}

/** Reads interviewer messages aloud with a voice matching the interview language. */
export function useSpeechSynthesis(options: UseSpeechSynthesisOptions): SpeechSynthesisController {
  const { lang, voicesTimeoutMs = 1200, cancelDelayMs = 60 } = options;
  const synthRef = useRef<SpeechSynthesisLike | null>(options.synth === undefined ? browserSynth() : options.synth);
  const factoryRef = useRef<UtteranceFactory | null>(
    options.createUtterance === undefined ? browserUtteranceFactory() : options.createUtterance,
  );
  const tokenRef = useRef(0);
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Chrome garbage-collects utterances that nothing references and then never fires `end`: keep them until done.
  const liveUtterancesRef = useRef(new Set<SpeechSynthesisUtterance>());
  const [speaking, setSpeaking] = useState(false);
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [noVoiceForLang, setNoVoiceForLang] = useState(false);

  const supported = synthRef.current !== null && factoryRef.current !== null;

  const clearWatchdog = () => {
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = null;
  };

  const waitForVoices = useCallback(
    (synth: SpeechSynthesisLike) =>
      new Promise<SpeechSynthesisVoice[]>((resolve) => {
        const initial = synth.getVoices();
        if (initial.length > 0) {
          resolve(initial);
          return;
        }
        // Chrome loads voices asynchronously and announces them with `voiceschanged`.
        const done = () => {
          clearTimeout(timer);
          synth.removeEventListener("voiceschanged", done);
          resolve(synth.getVoices());
        };
        const timer = setTimeout(done, voicesTimeoutMs);
        synth.addEventListener("voiceschanged", done);
      }),
    [voicesTimeoutMs],
  );

  const cancel = useCallback(() => {
    tokenRef.current += 1;
    clearWatchdog();
    synthRef.current?.cancel();
    liveUtterancesRef.current.clear();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      const synth = synthRef.current;
      const createUtterance = factoryRef.current;
      const chunks = splitForSpeech(text);
      if (!synth || !createUtterance || chunks.length === 0) {
        onEnd?.();
        return;
      }
      const token = ++tokenRef.current;
      clearWatchdog();
      synth.cancel();
      setSpeaking(true);

      let ended = false;
      const finish = () => {
        if (token !== tokenRef.current || ended) return;
        ended = true;
        clearWatchdog();
        setSpeaking(false);
        onEnd?.();
      };

      const afterCancel = new Promise<void>((resolve) => setTimeout(resolve, cancelDelayMs));
      void Promise.all([waitForVoices(synth), afterCancel]).then(([voices]) => {
        if (token !== tokenRef.current) return;
        const chosen = pickVoice(voices, lang);
        setVoice(chosen);
        if (!chosen && voices.length > 0) {
          // Reading Indonesian with e.g. an English voice is unintelligible: rely on captions instead.
          setNoVoiceForLang(true);
          finish();
          return;
        }
        setNoVoiceForLang(false);
        synth.resume?.();
        const live = liveUtterancesRef.current;
        live.clear();
        chunks.forEach((chunk, index) => {
          const utterance = createUtterance(chunk);
          utterance.lang = chosen?.lang ?? lang;
          if (chosen) utterance.voice = chosen;
          utterance.rate = 1;
          utterance.pitch = 1;
          const release = () => live.delete(utterance);
          if (index === chunks.length - 1) {
            utterance.onend = () => {
              release();
              finish();
            };
          } else {
            utterance.onend = release;
          }
          utterance.onerror = () => {
            release();
            finish();
          };
          live.add(utterance);
          synth.speak(utterance);
        });
        // Some engines never fire `end`; don't leave the candidate waiting forever.
        const words = text.split(/\s+/).length;
        watchdogRef.current = setTimeout(finish, (words / 2) * 1000 + 8000);
      });
    },
    [cancelDelayMs, lang, waitForVoices],
  );

  useEffect(() => {
    const synth = synthRef.current;
    const live = liveUtterancesRef.current;
    window.addEventListener("pagehide", cancel);
    return () => {
      window.removeEventListener("pagehide", cancel);
      tokenRef.current += 1;
      clearWatchdog();
      synth?.cancel();
      live.clear();
    };
  }, [cancel]);

  return { supported, speaking, voice, noVoiceForLang, speak, cancel };
}
