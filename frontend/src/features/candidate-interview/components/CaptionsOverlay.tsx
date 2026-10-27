import { useInterviewCopy } from "../i18n";

/** Live captions at the bottom of the stage: the interviewer's question, or the candidate's own words. */
export function CaptionsOverlay({
  speaker,
  text,
  interim = "",
}: {
  speaker: string;
  text: string;
  interim?: string;
}) {
  const t = useInterviewCopy();
  if (!text.trim() && !interim.trim()) return null;
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-3 z-20 flex justify-center sm:inset-x-6">
      <div
        className="max-h-36 max-w-3xl overflow-hidden rounded-lg bg-black/75 px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-lg sm:text-base"
        data-testid="captions"
      >
        <p className="mb-0.5 text-xs font-semibold text-[#8ab4f8]">{speaker === "you" ? t.you : speaker}</p>
        <p className="line-clamp-4">
          {text}
          {interim ? <span className="text-white/60"> {interim}</span> : null}
        </p>
      </div>
    </div>
  );
}
