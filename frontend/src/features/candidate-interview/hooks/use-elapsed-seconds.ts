import { useEffect, useState } from "react";

/** Seconds since `startedAt` (ISO) — or since mount when the API hasn't sent a start time — ticking every second. */
export function useElapsedSeconds(startedAt: string | null): number {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const parsed = startedAt ? Date.parse(startedAt) : Number.NaN;
  const origin = Number.isNaN(parsed) ? mountedAt : parsed;
  return Math.max(0, Math.floor((now - origin) / 1000));
}
