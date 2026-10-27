import { useCallback, useEffect, useState } from "react";
import type { CandidateInterviewState } from "@/types/api";
import { currentInterviewerUtterance, resolveSpeechLang } from "../candidate-interview-utils";
import { useAudioLevel } from "../hooks/use-audio-level";
import { useInterviewerVoice, type FetchAckAudio, type FetchMessageAudio } from "../hooks/use-interviewer-voice";
import { useMediaDevices } from "../hooks/use-media-devices";
import { useScreenShare } from "../hooks/use-screen-share";
import { getSpeechRecognitionConstructor } from "../hooks/use-speech-recognition";
import type { CandidateInterviewController } from "../use-candidate-interview";
import { Lobby } from "./Lobby";
import { MeetingRoom } from "./MeetingRoom";

/**
 * Lobby → call for a pending or in-progress interview. Owns the camera/mic and screen streams so the
 * preview carries over into the room; unmounting (e.g. the thank-you screen) stops every track.
 */
export function LiveInterview({
  state,
  start,
  send,
  complete,
  fetchAudio,
  fetchAckAudio = null,
  applyState,
  startError,
}: {
  state: CandidateInterviewState;
  start: CandidateInterviewController["start"];
  send: CandidateInterviewController["send"];
  complete: CandidateInterviewController["complete"];
  fetchAudio: FetchMessageAudio | null;
  /** Conversational mode: acknowledgement clips. */
  fetchAckAudio?: FetchAckAudio | null;
  applyState: CandidateInterviewController["applyState"];
  startError: string | null;
}) {
  const media = useMediaDevices();
  const screen = useScreenShare();
  const [joined, setJoined] = useState(false);
  const [recognitionSupported] = useState(() => getSpeechRecognitionConstructor() !== null);
  const level = useAudioLevel(media.stream, media.micOn, media.streamVersion);
  const voice = useInterviewerVoice({
    lang: resolveSpeechLang(state),
    serverTts: state.voice.server_tts,
    fetchAudio,
    fetchAckAudio,
  });

  // Fetch the interviewer's audio as soon as a new message arrives (already in the lobby when rejoining).
  const utterance = state.status === "in_progress" ? currentInterviewerUtterance(state) : null;
  const { prefetch } = voice;
  const utteranceKey = utterance?.key ?? null;
  const utteranceText = utterance?.text ?? "";
  const utteranceId = utterance?.messageId ?? null;
  useEffect(() => {
    if (utteranceKey) prefetch({ key: utteranceKey, text: utteranceText, messageId: utteranceId });
  }, [prefetch, utteranceKey, utteranceText, utteranceId]);

  // Conversational mode: have the acknowledgements ready so they play the moment an answer is sent.
  const acknowledgements = state.status === "in_progress" && state.mode === "conversational" ? state.acknowledgements : [];
  const ackSignature = acknowledgements.join("\n");
  useEffect(() => {
    if (!ackSignature) return;
    ackSignature.split("\n").forEach((text, index) => prefetch({ key: `ack-${index}`, text, messageId: null, ackIndex: index }));
  }, [prefetch, ackSignature]);

  const { request } = media;
  useEffect(() => {
    void request();
  }, [request]);

  const { stop: stopMedia } = media;
  const { stop: stopScreen } = screen;
  const leave = useCallback(() => {
    stopScreen();
    stopMedia();
  }, [stopMedia, stopScreen]);

  const inRoom = joined && state.status === "in_progress";

  if (!inRoom) {
    return (
      <Lobby
        state={state}
        media={media}
        level={level}
        recognitionSupported={recognitionSupported}
        joining={start.isPending}
        errorMessage={startError}
        onJoin={() => {
          // Still inside the Join click: unlock audio so the interviewer can speak without another gesture.
          voice.unlock();
          if (state.status === "in_progress") {
            setJoined(true);
            return;
          }
          start.mutate(undefined, { onSuccess: () => setJoined(true) });
        }}
      />
    );
  }

  return (
    <MeetingRoom
      state={state}
      media={media}
      screen={screen}
      level={level}
      send={send}
      complete={complete}
      applyState={applyState}
      voice={voice}
      onLeave={leave}
    />
  );
}
