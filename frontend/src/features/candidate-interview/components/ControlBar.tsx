import {
  Captions,
  CaptionsOff,
  Check,
  Loader2,
  MessageSquareText,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  RotateCcw,
  Video,
  VideoOff,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { useInterviewCopy } from "../i18n";

type Tone = "neutral" | "off" | "active" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "bg-[#3c4043] text-white hover:bg-[#4a4e51]",
  off: "bg-rose-600 text-white hover:bg-rose-500",
  active: "bg-sky-200 text-[#062e6f] hover:bg-sky-100",
  danger: "bg-rose-600 text-white hover:bg-rose-500 w-14 sm:w-16",
};

/** Round Meet-style control with an accessible name and a hover/focus tooltip. */
export function ControlButton({
  icon: Icon,
  label,
  onClick,
  tone = "neutral",
  pressed,
  disabled = false,
  shortcut,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: Tone;
  /** For toggles: exposes aria-pressed. */
  pressed?: boolean;
  disabled?: boolean;
  shortcut?: string;
  className?: string;
}) {
  return (
    <div className={cn("group relative", className)}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={pressed}
        aria-keyshortcuts={shortcut}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full transition-colors sm:h-12 sm:w-12",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#202124]",
          "disabled:cursor-not-allowed disabled:opacity-40",
          toneClass[tone],
        )}
      >
        <Icon className="size-5" aria-hidden />
      </button>
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-[#e8eaed] px-2 py-1 text-xs font-medium text-[#202124] shadow group-hover:block group-has-[:focus-visible]:block"
      >
        {label}
        {shortcut ? <span className="ml-1 text-[#5f6368]">({shortcut.replace("Control", "Ctrl")})</span> : null}
      </span>
    </div>
  );
}

export interface ControlBarProps {
  micOn: boolean;
  cameraOn: boolean;
  sharing: boolean;
  shareSupported: boolean;
  captionsOn: boolean;
  panelOpen: boolean;
  canRepeat: boolean;
  canSubmit: boolean;
  submitting: boolean;
  ending: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleShare: () => void;
  onToggleCaptions: () => void;
  onTogglePanel: () => void;
  onRepeat: () => void;
  onSubmit: () => void;
  onEnd: () => void;
  clock: string;
}

export function ControlBar(props: ControlBarProps) {
  const t = useInterviewCopy();
  return (
    <div
      role="toolbar"
      aria-label={t.moreControls}
      className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 sm:gap-3 md:justify-between md:px-5"
    >
      <p className="hidden min-w-32 text-sm font-medium tabular-nums text-[#e8eaed] md:block">{props.clock}</p>

      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
        <ControlButton
          icon={props.micOn ? Mic : MicOff}
          label={props.micOn ? t.turnOffMic : t.turnOnMic}
          pressed={!props.micOn}
          tone={props.micOn ? "neutral" : "off"}
          onClick={props.onToggleMic}
          shortcut="Control+D"
        />
        <ControlButton
          icon={props.cameraOn ? Video : VideoOff}
          label={props.cameraOn ? t.turnOffCamera : t.turnOnCamera}
          pressed={!props.cameraOn}
          tone={props.cameraOn ? "neutral" : "off"}
          onClick={props.onToggleCamera}
          shortcut="Control+E"
        />
        <ControlButton
          icon={props.sharing ? MonitorX : MonitorUp}
          label={props.shareSupported ? (props.sharing ? t.stopShareScreen : t.shareScreen) : t.screenShareUnsupported}
          pressed={props.sharing}
          tone={props.sharing ? "active" : "neutral"}
          onClick={props.onToggleShare}
          disabled={!props.shareSupported}
        />
        <ControlButton
          icon={props.captionsOn ? Captions : CaptionsOff}
          label={props.captionsOn ? t.captionsOff : t.captionsOn}
          pressed={props.captionsOn}
          tone={props.captionsOn ? "active" : "neutral"}
          onClick={props.onToggleCaptions}
        />
        <ControlButton icon={RotateCcw} label={t.repeatQuestion} onClick={props.onRepeat} disabled={!props.canRepeat} />
        <ControlButton
          icon={MessageSquareText}
          label={props.panelOpen ? t.closeTranscript : t.openTranscript}
          pressed={props.panelOpen}
          tone={props.panelOpen ? "active" : "neutral"}
          onClick={props.onTogglePanel}
        />
        <ControlButton icon={PhoneOff} label={t.endCall} tone="danger" onClick={props.onEnd} disabled={props.ending} />
      </div>

      <div className="flex w-full items-center justify-center gap-2 md:w-auto md:min-w-32 md:justify-end">
        <button
          type="button"
          onClick={props.onSubmit}
          disabled={!props.canSubmit || props.submitting}
          aria-busy={props.submitting || undefined}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-full bg-sky-300 px-5 text-sm font-semibold text-[#062e6f] transition-colors hover:bg-sky-200 sm:h-12",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#202124]",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {props.submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
          {props.submitting ? t.sending : t.doneAnswering}
        </button>
      </div>
    </div>
  );
}
