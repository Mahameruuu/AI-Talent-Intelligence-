import { MicOff, MonitorUp } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/utils/cn";
import { initials } from "@/utils/format";
import { useInterviewCopy } from "../i18n";

/** Local-only <video> preview of a MediaStream (always muted: no echo, nothing leaves the device). */
export function VideoView({
  stream,
  version = 0,
  mirrored = false,
  fit = "cover",
  className,
  label,
}: {
  stream: MediaStream | null;
  version?: number;
  mirrored?: boolean;
  fit?: "cover" | "contain";
  className?: string;
  label?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // Re-assign even for the same stream object: tracks may have been added (camera turned back on).
    element.srcObject = null;
    element.srcObject = stream;
  }, [stream, version]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      aria-label={label}
      className={cn(
        "size-full bg-black",
        fit === "cover" ? "object-cover" : "object-contain",
        mirrored && "-scale-x-100",
        className,
      )}
    />
  );
}

function TileFrame({
  children,
  name,
  badge,
  highlighted = false,
  className,
  label,
}: {
  children: ReactNode;
  name: string;
  badge?: ReactNode;
  highlighted?: boolean;
  className?: string;
  label: string;
}) {
  return (
    <figure
      aria-label={label}
      className={cn(
        "relative isolate flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-[#3c4043] ring-2 ring-transparent transition-shadow",
        highlighted && "ring-sky-400/80",
        className,
      )}
    >
      {children}
      <figcaption className="absolute bottom-2 left-2 z-10 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white sm:text-sm">
        {badge}
        <span className="truncate">{name}</span>
      </figcaption>
    </figure>
  );
}

/** Animated bars shown while the interviewer's voice is playing. */
function Waveform({ active }: { active: boolean }) {
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {[0, 1, 2, 3].map((bar) => (
        <span
          key={bar}
          className={cn("w-1 rounded-full bg-sky-300", active ? "animate-pulse" : "opacity-40")}
          style={{ height: active ? `${[60, 100, 75, 45][bar]}%` : "25%", animationDelay: `${bar * 150}ms` }}
        />
      ))}
    </span>
  );
}

export function AiTile({
  name,
  speaking,
  className,
  compact = false,
}: {
  name: string;
  speaking: boolean;
  className?: string;
  compact?: boolean;
}) {
  const t = useInterviewCopy();
  return (
    <TileFrame
      name={name}
      label={speaking ? `${name} — ${t.aiSpeaking}` : name}
      highlighted={speaking}
      badge={<Waveform active={speaking} />}
      className={cn("bg-gradient-to-br from-[#283a5b] via-[#2b2f4a] to-[#1f2937]", className)}
    >
      <div className="relative flex items-center justify-center">
        {speaking ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-sky-400/30" aria-hidden />
        ) : null}
        <div
          className={cn(
            "relative flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-sky-500 font-semibold text-white shadow-lg ring-4 transition-all",
            compact ? "size-14 text-lg" : "size-20 text-2xl sm:size-28 sm:text-3xl",
            speaking ? "ring-sky-300/70" : "ring-white/10",
          )}
          aria-hidden
        >
          AI
        </div>
      </div>
      {speaking ? <span className="sr-only">{t.aiSpeaking}</span> : null}
    </TileFrame>
  );
}

export function SelfTile({
  name,
  stream,
  streamVersion,
  showVideo,
  micOn,
  level,
  className,
  compact = false,
}: {
  name: string;
  stream: MediaStream | null;
  streamVersion: number;
  showVideo: boolean;
  micOn: boolean;
  /** 0..1 microphone level (local analysis only). */
  level: number;
  className?: string;
  compact?: boolean;
}) {
  const t = useInterviewCopy();
  const talking = micOn && level > 0.12;
  return (
    <TileFrame
      name={`${name} (${t.you})`}
      label={`${name} (${t.you})`}
      highlighted={talking}
      badge={
        micOn ? null : (
          <span className="flex size-5 items-center justify-center rounded-full bg-rose-600" role="img" aria-label={t.micMuted}>
            <MicOff className="size-3" aria-hidden />
          </span>
        )
      }
      className={className}
    >
      {showVideo ? (
        <VideoView stream={stream} version={streamVersion} mirrored label={`${t.you} — video`} />
      ) : (
        <div
          role="img"
          aria-label={t.cameraOff}
          className={cn(
            "flex items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 font-semibold text-white shadow-lg ring-4 transition-all",
            compact ? "size-14 text-lg" : "size-20 text-2xl sm:size-28 sm:text-3xl",
            talking ? "ring-sky-300/70" : "ring-white/10",
          )}
        >
          <span aria-hidden>{initials(name)}</span>
        </div>
      )}
    </TileFrame>
  );
}

export function ScreenTile({ stream, className }: { stream: MediaStream; className?: string }) {
  const t = useInterviewCopy();
  return (
    <TileFrame
      name={t.yourScreen}
      label={t.yourScreen}
      badge={<MonitorUp className="size-3.5" aria-hidden />}
      className={cn("bg-black", className)}
    >
      <VideoView stream={stream} fit="contain" label={t.yourScreen} />
    </TileFrame>
  );
}
