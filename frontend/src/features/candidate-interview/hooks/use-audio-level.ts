import { useEffect, useState } from "react";

type AudioContextConstructor = new () => AudioContext;

function getAudioContextCtor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * 0..1 loudness of the stream's microphone, analysed locally for the level meter only.
 * Returns 0 when disabled or when Web Audio isn't available.
 */
export function useAudioLevel(stream: MediaStream | null, enabled: boolean, streamVersion = 0): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    const Ctor = getAudioContextCtor();
    const hasAudio = stream?.getAudioTracks().some((track) => track.readyState === "live" && track.enabled) ?? false;
    if (!enabled || !stream || !hasAudio || !Ctor) {
      setLevel(0);
      return;
    }
    let context: AudioContext;
    try {
      context = new Ctor();
    } catch {
      return;
    }
    let frame = 0;
    let last = 0;
    try {
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        const next = Math.min(1, Math.sqrt(sum / data.length) * 4);
        if (Math.abs(next - last) > 0.03) {
          last = next;
          setLevel(next);
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    } catch {
      // Some browsers refuse to analyse certain streams; the meter simply stays flat.
    }
    return () => {
      cancelAnimationFrame(frame);
      void context.close().catch(() => undefined);
      setLevel(0);
    };
  }, [stream, enabled, streamVersion]);

  return level;
}
