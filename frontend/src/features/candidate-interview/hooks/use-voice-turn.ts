import { useCallback, useEffect, useRef, useState } from "react";
import type { CandidateInterviewMessageInput } from "@/types/api";
import { appendPhrase, MAX_ANSWER_LENGTH } from "../candidate-interview-utils";
import {
  useSpeechRecognition,
  type RecognitionBlock,
  type SpeechRecognitionConstructor,
} from "./use-speech-recognition";
import type { InterviewerMessage, InterviewerVoiceController } from "./use-interviewer-voice";

export type TurnPhase = "ai-speaking" | "listening" | "your-turn" | "processing";

export interface VoiceTurnOptions {
  speechLang: string;
  /** Latest interviewer utterance; `key` identifies it so each message is spoken once. */
  utterance: InterviewerMessage | null;
  /** The interviewer's voice (server audio with browser speech fallback). */
  voice: InterviewerVoiceController;
  micOn: boolean;
  /** An answer is being sent / the call is ending: never listen. */
  busy: boolean;
  /** Temporarily don't listen (e.g. the end-call dialog is open). */
  paused?: boolean;
  /**
   * Don't start reading a new interviewer message yet (an acknowledgement is still playing); it is read
   * as soon as the hold is released. Never listens meanwhile.
   */
  hold?: boolean;
  /** Injection point for tests. */
  Recognition?: SpeechRecognitionConstructor | null;
}

export interface VoiceTurn {
  phase: TurnPhase;
  aiSpeaking: boolean;
  /** The interviewer's audio is still being fetched. */
  aiPreparing: boolean;
  listening: boolean;
  /** Editable answer (final recognised phrases + anything typed). */
  draft: string;
  interim: string;
  inputMode: "voice" | "text";
  recognitionSupported: boolean;
  recognitionBlocked: RecognitionBlock | null;
  noVoiceForLang: boolean;
  setDraft: (value: string) => void;
  repeat: () => void;
  /** Collect the answer to submit (or null when empty) and stop listening without keeping stray results. */
  takeAnswer: () => CandidateInterviewMessageInput | null;
  clearAnswer: () => void;
  restoreAnswer: (input: CandidateInterviewMessageInput) => void;
  /** Leave the call: silence the interviewer and release the recogniser. */
  shutdown: () => void;
}

/**
 * Turn-taking for the voice interview: speak each new interviewer message once, then listen
 * (never while the AI is speaking, so it doesn't transcribe itself) until the candidate submits.
 */
export function useVoiceTurn(options: VoiceTurnOptions): VoiceTurn {
  const { speechLang, utterance, voice, micOn, busy, paused = false, hold = false } = options;
  const [draft, setDraftState] = useState("");
  const [voiceUsed, setVoiceUsed] = useState(false);
  const [spokenKey, setSpokenKey] = useState<string | null>(null);
  const spokenKeysRef = useRef(new Set<string>());

  const onFinalResult = useCallback((text: string) => {
    setDraftState((current) => appendPhrase(current, text));
    setVoiceUsed(true);
  }, []);

  const recognition = useSpeechRecognition({
    lang: speechLang,
    onFinalResult,
    Recognition: options.Recognition,
  });

  const { speak } = voice;
  const utteranceKey = utterance?.key ?? null;
  const utteranceText = utterance?.text ?? "";
  const utteranceId = utterance?.messageId ?? null;

  // Speak each new interviewer message exactly once.
  useEffect(() => {
    if (hold || !utteranceKey || spokenKeysRef.current.has(utteranceKey)) return;
    spokenKeysRef.current.add(utteranceKey);
    setSpokenKey(utteranceKey);
    speak({ key: utteranceKey, text: utteranceText, messageId: utteranceId });
  }, [hold, utteranceKey, utteranceText, utteranceId, speak]);

  const awaitingSpeech = utteranceKey !== null && spokenKey !== utteranceKey;
  const canRecognise = recognition.supported && recognition.blocked === null;
  const shouldListen = micOn && canRecognise && !voice.speaking && !busy && !paused && !hold && !awaitingSpeech;

  const { start: startListening, stop: stopListening } = recognition;
  useEffect(() => {
    if (shouldListen) startListening();
    else stopListening();
  }, [shouldListen, startListening, stopListening]);

  const setDraft = useCallback((value: string) => setDraftState(value.slice(0, MAX_ANSWER_LENGTH)), []);

  const repeat = useCallback(() => {
    if (utteranceKey && utteranceText) speak({ key: utteranceKey, text: utteranceText, messageId: utteranceId });
  }, [speak, utteranceKey, utteranceText, utteranceId]);

  const { abort: abortListening, interim } = recognition;
  const takeAnswer = useCallback((): CandidateInterviewMessageInput | null => {
    const content = appendPhrase(draft, interim).trim();
    if (!content) return null;
    const usedVoice = voiceUsed || interim.trim().length > 0;
    abortListening();
    return { content: content.slice(0, MAX_ANSWER_LENGTH), input_mode: usedVoice ? "voice" : "text" };
  }, [abortListening, draft, interim, voiceUsed]);

  const clearAnswer = useCallback(() => {
    setDraftState("");
    setVoiceUsed(false);
  }, []);

  const restoreAnswer = useCallback((input: CandidateInterviewMessageInput) => {
    setDraftState((current) => (current.trim() ? current : input.content));
    setVoiceUsed(input.input_mode === "voice");
  }, []);

  const { cancel: cancelSpeech } = voice;
  const shutdown = useCallback(() => {
    cancelSpeech();
    abortListening();
  }, [abortListening, cancelSpeech]);

  let phase: TurnPhase;
  if (busy || (hold && awaitingSpeech)) phase = "processing";
  else if (voice.speaking || awaitingSpeech) phase = "ai-speaking";
  else if (recognition.listening) phase = "listening";
  else phase = "your-turn";

  return {
    phase,
    aiSpeaking: voice.speaking,
    aiPreparing: voice.preparing,
    listening: recognition.listening,
    draft,
    interim: recognition.interim,
    inputMode: voiceUsed ? "voice" : "text",
    recognitionSupported: recognition.supported,
    recognitionBlocked: recognition.blocked,
    noVoiceForLang: voice.noVoiceForLang,
    setDraft,
    repeat,
    takeAnswer,
    clearAnswer,
    restoreAnswer,
    shutdown,
  };
}
