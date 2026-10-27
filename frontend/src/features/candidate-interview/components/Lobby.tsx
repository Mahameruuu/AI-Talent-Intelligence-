import { CalendarClock, Clock, Info, ListChecks, Lock, Mic, MicOff, RefreshCw, ShieldCheck, Video, VideoOff } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { LogoMark } from "@/components/layout/Logo";
import { Alert, Button, Checkbox } from "@/components/ui";
import type { CandidateInterviewState } from "@/types/api";
import { cn } from "@/utils/cn";
import { initials } from "@/utils/format";
import type { MediaDevicesController } from "../hooks/use-media-devices";
import { formatInterviewDate, mediaErrorMessage, useInterviewCopy } from "../i18n";
import { ControlButton } from "./ControlBar";
import { PoweredBy } from "./CandidateLayout";
import { VideoView } from "./MediaTiles";

function Fact({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2 text-sm text-slate-600 [&_svg]:size-4 [&_svg]:text-indigo-600">
      {icon}
      <span>{children}</span>
    </li>
  );
}

function MicMeter({ level, active, label }: { level: number; active: boolean; label: string }) {
  const value = active ? Math.round(level * 100) : 0;
  return (
    <div className="flex items-center gap-2" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
      {active ? <Mic className="size-4 text-slate-500" aria-hidden /> : <MicOff className="size-4 text-rose-600" aria-hidden />}
      <div className="flex h-2 flex-1 gap-0.5" aria-hidden>
        {Array.from({ length: 12 }, (_, index) => (
          <span
            key={index}
            className={cn("flex-1 rounded-full transition-colors", value > (index / 12) * 100 ? "bg-emerald-500" : "bg-slate-200")}
          />
        ))}
      </div>
    </div>
  );
}

/** Meet-style "Ready to join?" screen: device preview, instructions, privacy notice and consent. */
export function Lobby({
  state,
  media,
  level,
  recognitionSupported,
  onJoin,
  joining,
  errorMessage,
}: {
  state: CandidateInterviewState;
  media: MediaDevicesController;
  level: number;
  recognitionSupported: boolean;
  onJoin: () => void;
  joining: boolean;
  errorMessage: string | null;
}) {
  const t = useInterviewCopy();
  const [consent, setConsent] = useState(state.consent_given);
  const consentId = useId();
  const privacyId = useId();
  const instructionsId = useId();
  const firstName = state.candidate_first_name.trim() || null;
  const displayName = state.candidate_name.trim() || state.candidate_first_name.trim() || t.you;
  const resuming = state.status === "in_progress";
  const showVideo = media.cameraOn && media.hasCamera;

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-6">
        <LogoMark className="size-8" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{state.job_title}</p>
          <p className="truncate text-xs text-slate-500">{state.company_name}</p>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:py-10">
        <section aria-label={t.checkDevices} className="space-y-3">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#202124] shadow-sm">
            {showVideo ? (
              <VideoView stream={media.stream} version={media.streamVersion} mirrored label={t.checkDevices} />
            ) : (
              <div className="flex size-full flex-col items-center justify-center gap-3 text-[#e8eaed]">
                <div
                  role="img"
                  aria-label={t.cameraPreviewOff}
                  className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-2xl font-semibold text-white sm:size-24"
                >
                  <span aria-hidden>{initials(displayName)}</span>
                </div>
                <p className="text-sm">{media.status === "requesting" ? t.startingCamera : t.cameraPreviewOff}</p>
              </div>
            )}
            <p className="absolute left-3 top-3 rounded-md bg-black/50 px-2 py-1 text-xs font-medium text-white">{displayName}</p>
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">
              <ControlButton
                icon={media.micOn ? Mic : MicOff}
                label={media.micOn ? t.turnOffMic : t.turnOnMic}
                pressed={!media.micOn}
                tone={media.micOn ? "neutral" : "off"}
                onClick={() => media.setMicOn(!media.micOn)}
              />
              <ControlButton
                icon={media.cameraOn ? Video : VideoOff}
                label={media.cameraOn ? t.turnOffCamera : t.turnOnCamera}
                pressed={!media.cameraOn}
                tone={media.cameraOn ? "neutral" : "off"}
                onClick={() => void media.setCameraOn(!media.cameraOn)}
              />
            </div>
          </div>
          <MicMeter level={level} active={media.micOn && media.hasMic} label={t.micLevel} />
          {media.error ? (
            <Alert
              tone="warning"
              action={
                media.error === "insecure" || media.error === "unsupported" ? null : (
                  <Button size="sm" variant="secondary" leftIcon={<RefreshCw />} onClick={() => void media.request()}>
                    {t.retryDevices}
                  </Button>
                )
              }
            >
              {mediaErrorMessage(t, media.error)}
            </Alert>
          ) : null}
          {!recognitionSupported ? <Alert tone="info">{t.recognitionUnsupported}</Alert> : null}
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t.localOnlyNotice}
          </p>
        </section>

        <section className="space-y-6">
          <div>
            <h1 className="text-2xl font-normal tracking-tight sm:text-3xl">{t.readyToJoin}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              <span className="font-medium text-slate-900">{t.lobbyGreeting(firstName)}</span>{" "}
              {t.lobbyIntro(state.job_title, state.company_name)}
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              <Fact icon={<Clock />}>{t.aboutMinutes(state.duration_minutes)}</Fact>
              <Fact icon={<ListChecks />}>{t.questionsCount(state.questions_total)}</Fact>
              <Fact icon={<CalendarClock />}>{t.linkValidUntil(formatInterviewDate(state.expires_at, t.locale))}</Fact>
            </ul>
          </div>

          <form
            className="space-y-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (consent && !joining) onJoin();
            }}
          >
            {resuming ? (
              <p className="flex items-start gap-2 text-sm text-slate-700">
                <Info className="mt-0.5 size-4 shrink-0 text-indigo-600" aria-hidden />
                {t.consentAlreadyGiven}
              </p>
            ) : (
              <label htmlFor={consentId} className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  id={consentId}
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                  className="mt-0.5 size-5"
                  aria-describedby={privacyId}
                />
                <span className="text-[15px] leading-relaxed text-slate-800">{t.consentLabel}</span>
              </label>
            )}
            {errorMessage ? (
              <Alert tone="danger" title={t.startFailed}>
                {errorMessage}
              </Alert>
            ) : null}
            <Button type="submit" size="lg" className="h-12 w-full rounded-full text-base" disabled={!consent} loading={joining}>
              {resuming ? t.rejoin : t.joinNow}
            </Button>
            <p className="text-center text-xs leading-relaxed text-slate-500">{t.aiNoDecisions}</p>
          </form>
        </section>

        <div className="grid gap-6 lg:col-span-2 lg:grid-cols-2">
          {state.instructions.length > 0 ? (
            <section aria-labelledby={instructionsId} className="rounded-2xl border border-slate-200 p-5">
              <h2 id={instructionsId} className="text-base font-semibold">
                {t.beforeYouStart}
              </h2>
              <ol className="mt-4 space-y-3">
                {state.instructions.map((instruction, index) => (
                  <li key={index} className="flex gap-3 text-[15px] leading-relaxed text-slate-700">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          <section aria-labelledby={`${privacyId}-title`} className="rounded-2xl border border-slate-200 p-5">
            <h2 id={`${privacyId}-title`} className="flex items-center gap-2 text-base font-semibold">
              <ShieldCheck className="size-5 text-emerald-600" aria-hidden />
              {t.privacyNotice}
            </h2>
            <div
              id={privacyId}
              className="scrollbar-thin mt-3 max-h-64 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-slate-600"
              tabIndex={0}
              aria-label={t.privacyNoticeText}
            >
              {state.privacy_notice}
            </div>
          </section>
        </div>
      </main>
      <footer className="px-4 pb-8">
        <PoweredBy />
      </footer>
    </div>
  );
}
