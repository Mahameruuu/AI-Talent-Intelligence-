import { Info, Lock, MonitorX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { ConfirmDialog } from "@/components/ui";
import { getErrorMessage } from "@/services/api-client";
import type { CandidateInterviewState } from "@/types/api";
import { cn } from "@/utils/cn";
import {
  ACK_MAX_MS,
  closingMessage,
  closingTimeoutMs,
  currentInterviewerUtterance,
  formatClock,
  getInterviewProgress,
  questionPosition,
  resolveSpeechLang,
  terminalReasonFromError,
} from "../candidate-interview-utils";
import { useElapsedSeconds } from "../hooks/use-elapsed-seconds";
import type { MediaDevicesController } from "../hooks/use-media-devices";
import type { ScreenShareController } from "../hooks/use-screen-share";
import type { SpeechRecognitionConstructor } from "../hooks/use-speech-recognition";
import type { InterviewerMessage, InterviewerVoiceController } from "../hooks/use-interviewer-voice";
import { useVoiceTurn } from "../hooks/use-voice-turn";
import { useInterviewCopy } from "../i18n";
import type { CandidateInterviewController } from "../use-candidate-interview";
import { AnswerBox } from "./AnswerBox";
import { CaptionsOverlay } from "./CaptionsOverlay";
import { ControlBar } from "./ControlBar";
import { AiTile, ScreenTile, SelfTile } from "./MediaTiles";
import { TranscriptPanel } from "./TranscriptPanel";

/** Optional browser-API overrides (tests / previews); defaults use the real browser APIs. */
export interface SpeechOverrides {
  Recognition?: SpeechRecognitionConstructor | null;
}

function tail(text: string, max = 220): string {
  return text.length > max ? `…${text.slice(text.length - max)}` : text;
}

/** The Meet-like interview call: AI interviewer + self-view, captions, controls and transcript. */
export function MeetingRoom({
  state,
  media,
  screen,
  level,
  send,
  complete,
  applyState,
  voice,
  onLeave,
  speech,
}: {
  state: CandidateInterviewState;
  media: MediaDevicesController;
  screen: ScreenShareController;
  level: number;
  send: CandidateInterviewController["send"];
  complete: CandidateInterviewController["complete"];
  /** Show a state from the server (conversational mode: the completed state, once the closing has been read). */
  applyState: CandidateInterviewController["applyState"];
  /** The interviewer's voice (owned by LiveInterview so the Join click can unlock audio). */
  voice: InterviewerVoiceController;
  /** Release camera, mic and screen (called before the thank-you screen). */
  onLeave: () => void;
  speech?: SpeechOverrides;
}) {
  const t = useInterviewCopy();
  const [captionsOn, setCaptionsOn] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversational = state.mode === "conversational";
  // Conversational mode: a short spoken acknowledgement right after each answer, and a closing message at the end.
  const [ackPlaying, setAckPlaying] = useState(false);
  const ackCountRef = useRef(state.questions_answered);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState<{ state: CandidateInterviewState; message: InterviewerMessage } | null>(null);
  const closingStartedRef = useRef(false);

  const sending = send.isPending;
  const ending = complete.isPending;
  const utterance = currentInterviewerUtterance(state);
  const position = questionPosition(state);
  const progress = getInterviewProgress(state);
  const interviewerName = state.interviewer_name.trim() || t.interviewerLabel;
  const candidateName = state.candidate_name.trim() || state.candidate_first_name.trim() || t.you;

  const turn = useVoiceTurn({
    speechLang: resolveSpeechLang(state),
    utterance,
    voice,
    micOn: media.micOn,
    busy: sending || ending || closing !== null,
    paused: confirmEnd,
    hold: ackPlaying,
    ...speech,
  });

  const elapsed = useElapsedSeconds(state.started_at);
  const clock = t.elapsedOf(formatClock(elapsed), formatClock(state.duration_minutes * 60));

  const { shutdown } = turn;
  const leave = useCallback(() => {
    shutdown();
    onLeave();
  }, [onLeave, shutdown]);

  useEffect(
    () => () => {
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    },
    [],
  );

  /** Conversational mode: acknowledge the answer at once (rotating through the lines) while it is being sent. */
  const playAcknowledgement = () => {
    const lines = conversational ? state.acknowledgements : [];
    if (lines.length === 0) return;
    const index = ackCountRef.current % lines.length;
    ackCountRef.current += 1;
    const text = lines[index];
    if (!text?.trim()) return;
    if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
      ackTimerRef.current = null;
      setAckPlaying(false);
    };
    setAckPlaying(true);
    ackTimerRef.current = setTimeout(release, ACK_MAX_MS);
    voice.speak({ key: `ack-${ackCountRef.current}`, text, messageId: null, ackIndex: index }, release);
  };

  // Read the closing (after the acknowledgement), then leave and show the completed screen.
  const { speak } = voice;
  useEffect(() => {
    if (!closing || ackPlaying || closingStartedRef.current) return;
    closingStartedRef.current = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      leave();
      applyState(closing.state);
    };
    // `finish` may run synchronously from speak(), so the timer exists before speaking starts.
    const timer = setTimeout(finish, closingTimeoutMs(closing.message.text));
    speak(closing.message, finish);
  }, [ackPlaying, applyState, closing, leave, speak]);

  const { micOn, setMicOn, cameraOn, setCameraOn } = media;
  // Meet's shortcuts: Ctrl/⌘+D toggles the mic, Ctrl/⌘+E the camera.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key === "d") {
        event.preventDefault();
        setMicOn(!micOn);
      } else if (key === "e") {
        event.preventDefault();
        void setCameraOn(!cameraOn);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [micOn, setMicOn, cameraOn, setCameraOn]);

  const pendingText = `${turn.draft} ${turn.interim}`.trim();
  const canSubmit = pendingText.length > 0 && !sending && !ending;

  const submit = () => {
    if (sending || ending) return;
    const answer = turn.takeAnswer();
    if (!answer) {
      setError(t.emptyAnswer);
      return;
    }
    setError(null);
    turn.clearAnswer();
    playAcknowledgement();
    send.mutate(answer, {
      onSuccess: (next) => {
        if (next.status !== "completed") return;
        const message = closingMessage(next);
        if (message) setClosing({ state: next, message });
        else leave();
      },
      onError: (caught) => {
        if (terminalReasonFromError(caught)) {
          leave();
          return;
        }
        turn.restoreAnswer(answer);
        setError(`${t.sendFailed} ${getErrorMessage(caught)}`);
      },
    });
  };

  const endInterview = () => {
    setError(null);
    complete.mutate(undefined, {
      onSuccess: () => {
        setConfirmEnd(false);
        leave();
      },
      onError: (caught) => {
        setConfirmEnd(false);
        if (terminalReasonFromError(caught)) {
          leave();
          return;
        }
        setError(`${t.completeFailed} ${getErrorMessage(caught)}`);
      },
    });
  };

  const recognitionUsable = turn.recognitionSupported && turn.recognitionBlocked === null;
  // Conversational mode: from the answer until the next question is heard, the interviewer is "thinking".
  const thinking =
    conversational &&
    closing === null &&
    (sending || ackPlaying || turn.phase === "processing" || (turn.aiPreparing && state.questions_answered > 0));
  const statusText = closing
    ? t.aiSpeaking
    : thinking
      ? t.thinking
      : turn.phase === "ai-speaking"
        ? turn.aiPreparing
          ? t.aiPreparing
          : t.aiSpeaking
        : turn.phase === "processing"
          ? t.processing
          : turn.phase === "listening"
            ? t.listening
            : recognitionUsable && media.micOn
              ? t.yourTurn
              : t.yourTurnTyping;

  const notices: string[] = [];
  if (!turn.recognitionSupported || turn.recognitionBlocked === "unsupported") notices.push(t.recognitionUnsupported);
  else if (turn.recognitionBlocked === "denied") notices.push(t.recognitionDenied);
  else if (turn.recognitionBlocked === "network") notices.push(t.recognitionNetwork);
  else if (!media.micOn) notices.push(t.micOffHint);
  if (turn.noVoiceForLang) notices.push(t.voiceUnavailable);

  // Captions: the interviewer while speaking, then the candidate's own words, else the question to re-read.
  let caption: { speaker: string; text: string; interim?: string } | null = null;
  if (closing) {
    caption = { speaker: interviewerName, text: closing.message.text };
  } else if (thinking) {
    // Acknowledgements aren't captioned, and the next question appears once it is spoken.
    caption = null;
  } else if (utterance && (turn.phase === "ai-speaking" || (!turn.draft && !turn.interim))) {
    caption = { speaker: interviewerName, text: utterance.text };
  } else if (turn.draft || turn.interim) {
    caption = { speaker: "you", text: tail(turn.draft), interim: turn.interim };
  }

  const answerBox = (variant: "dark" | "light") => (
    <AnswerBox
      value={turn.draft}
      interim={turn.interim}
      onChange={turn.setDraft}
      onSubmit={submit}
      disabled={sending || ending || closing !== null}
      voiceMode={recognitionUsable && media.micOn}
      variant={variant}
    />
  );

  const showSelfVideo = media.cameraOn && media.hasCamera;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#202124] text-[#e8eaed]">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-1 pt-3 sm:px-5">
        <LogoMark className="size-7" />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium">{state.job_title}</p>
          <p className="truncate text-xs text-[#9aa0a6]">{state.company_name}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {position ? (
            <span className="font-medium" aria-live="polite">
              {t.questionOf(position.index, position.total)}
            </span>
          ) : (
            <span>{t.interviewInProgress}</span>
          )}
          {position?.isFollowUp ? (
            <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-xs font-medium text-amber-200">{t.followUp}</span>
          ) : null}
        </div>
        <span className="text-sm tabular-nums text-[#bdc1c6] md:hidden" aria-label={clock}>
          {clock}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
          <Lock className="size-3.5" aria-hidden />
          {t.privacyBadge}
        </span>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <main className="relative flex min-h-0 flex-1 flex-col gap-2 px-3 pb-1 pt-2 sm:px-4">
          {screen.stream ? (
            <>
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#303134] px-4 py-2 text-sm"
              >
                <p>
                  <span className="font-medium">{t.sharingBanner}</span>{" "}
                  <span className="text-[#9aa0a6]">{t.sharingLocalOnly}</span>
                </p>
                <button
                  type="button"
                  onClick={screen.stop}
                  className="inline-flex items-center gap-1.5 rounded-full bg-sky-300 px-3 py-1.5 text-xs font-semibold text-[#062e6f] hover:bg-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
                >
                  <MonitorX className="size-4" aria-hidden />
                  {t.stopSharing}
                </button>
              </div>
              <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-2 md:grid-cols-[minmax(0,1fr)_15rem] md:grid-rows-1">
                <ScreenTile stream={screen.stream} className="min-h-40" />
                <div className="grid h-28 grid-cols-2 gap-2 md:h-auto md:grid-cols-1 md:grid-rows-2">
                  <AiTile name={interviewerName} speaking={turn.aiSpeaking} compact />
                  <SelfTile
                    name={candidateName}
                    stream={media.stream}
                    streamVersion={media.streamVersion}
                    showVideo={showSelfVideo}
                    micOn={media.micOn}
                    level={level}
                    compact
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 gap-2 md:grid-cols-2 md:grid-rows-1 md:gap-3">
              <AiTile name={interviewerName} speaking={turn.aiSpeaking} />
              <SelfTile
                name={candidateName}
                stream={media.stream}
                streamVersion={media.streamVersion}
                showVideo={showSelfVideo}
                micOn={media.micOn}
                level={level}
              />
            </div>
          )}
          {captionsOn && caption ? <CaptionsOverlay speaker={caption.speaker} text={caption.text} interim={caption.interim} /> : null}
        </main>

        {panelOpen ? (
          <TranscriptPanel
            messages={closing?.state.messages ?? state.messages}
            interviewerName={interviewerName}
            candidateName={candidateName}
            pendingAnswer={sending ? (send.variables?.content ?? null) : null}
            onClose={() => setPanelOpen(false)}
          >
            {answerBox("light")}
          </TranscriptPanel>
        ) : null}
      </div>

      <section aria-label={t.yourAnswer} className="shrink-0 px-3 pt-1 sm:px-4">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          <p className="flex items-center gap-2 text-sm text-[#bdc1c6]" role="status">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                turn.phase === "listening" ? "animate-pulse bg-emerald-400" : turn.phase === "ai-speaking" ? "bg-sky-400" : "bg-[#9aa0a6]",
              )}
              aria-hidden
            />
            {statusText}
          </p>
          {notices.map((notice) => (
            <p key={notice} className="flex items-start gap-2 rounded-lg bg-[#303134] px-3 py-2 text-xs leading-relaxed text-[#e8eaed]">
              <Info className="mt-0.5 size-3.5 shrink-0 text-sky-300" aria-hidden />
              {notice}
            </p>
          ))}
          {screen.error && screen.error !== "denied" ? (
            <p className="rounded-lg bg-[#303134] px-3 py-2 text-xs text-[#e8eaed]">{t.screenShareUnsupported}</p>
          ) : null}
          {error ? (
            <p role="alert" className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          ) : null}
          {panelOpen ? null : answerBox("dark")}
        </div>
      </section>

      <ControlBar
        micOn={media.micOn}
        cameraOn={media.cameraOn}
        sharing={screen.sharing}
        shareSupported={screen.supported}
        captionsOn={captionsOn}
        panelOpen={panelOpen}
        canRepeat={utterance !== null && !sending && !ending && !ackPlaying && closing === null}
        canSubmit={canSubmit && closing === null}
        submitting={sending}
        ending={ending}
        onToggleMic={() => setMicOn(!micOn)}
        onToggleCamera={() => void setCameraOn(!cameraOn)}
        onToggleShare={() => (screen.sharing ? screen.stop() : void screen.start())}
        onToggleCaptions={() => setCaptionsOn((on) => !on)}
        onTogglePanel={() => setPanelOpen((open) => !open)}
        onRepeat={turn.repeat}
        onSubmit={submit}
        onEnd={() => setConfirmEnd(true)}
        clock={clock}
      />

      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={endInterview}
        loading={ending}
        tone="danger"
        title={progress.allAnswered ? t.endTitleAllAnswered : t.endTitle}
        description={progress.allAnswered ? t.endBodyAllAnswered : t.endBody(progress.answered, progress.total)}
        confirmLabel={t.endConfirm}
        cancelLabel={t.keepGoing}
      />
    </div>
  );
}
