const dateFormatter = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const numberFormatter = new Intl.NumberFormat("en-US");

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value: string | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

/** Format a calendar day ("YYYY-MM-DD") without timezone shifts, e.g. "30 Nov 2026". */
export function formatDay(value: string | null | undefined, fallback = "—"): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return formatDate(value, fallback);
  return dateFormatter.format(new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/** Whole days between two "YYYY-MM-DD" calendar days (b − a). */
export function daysBetween(a: string, b: string): number {
  const parse = (value: string) => {
    const [y, m, d] = value.split("-").map(Number);
    return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((parse(b) - parse(a)) / 86_400_000);
}

export function formatDateTime(value: string | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : fallback;
}

export function formatTime(value: string | null | undefined, fallback = ""): string {
  const date = toDate(value);
  return date ? timeFormatter.format(date) : fallback;
}

/** "3 min ago", "in 2 days" — falls back to the absolute date for older values. */
export function formatRelative(value: string | null | undefined, now: Date = new Date()): string {
  const date = toDate(value);
  if (!date) return "—";
  const diffMs = date.getTime() - now.getTime();
  const abs = Math.abs(diffMs);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < minute) return "just now";
  if (abs < hour) return rtf.format(Math.round(diffMs / minute), "minute");
  if (abs < day) return rtf.format(Math.round(diffMs / hour), "hour");
  if (abs < 14 * day) return rtf.format(Math.round(diffMs / day), "day");
  return formatDate(value);
}

export function formatNumber(value: number | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return numberFormatter.format(value);
}

/** Score 0..100 rounded to an integer string, or the fallback when not computable. */
export function formatScore(value: number | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return String(Math.round(value));
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`;
}

/** 54 -> "4 yrs 6 mos" */
export function formatMonths(months: number | null | undefined, fallback = "—"): string {
  if (months === null || months === undefined || Number.isNaN(months)) return fallback;
  const total = Math.max(0, Math.round(months));
  const years = Math.floor(total / 12);
  const rest = total % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? "yr" : "yrs"}`);
  if (rest > 0 || years === 0) parts.push(`${rest} ${rest === 1 ? "mo" : "mos"}`);
  return parts.join(" ");
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Milliseconds -> "850 ms" / "2.4 s" / "1 min 12 s" */
export function formatDuration(ms: number | null | undefined, fallback = "—"): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return fallback;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes} min ${rest} s`;
}

/** "required_skills" -> "Required skills" */
export function humanize(value: string | null | undefined): string {
  if (!value) return "";
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

const idrFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

/** 12000000 -> "12.000.000" (Indonesian thousands separators, no currency symbol). */
export function formatIdrNumber(value: number): string {
  return idrFormatter.format(value);
}

/** 12000000 -> "Rp 12.000.000" */
export function formatIdr(value: number | null | undefined, fallback = "—"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return `Rp ${idrFormatter.format(value)}`;
}

/**
 * Monthly salary range: "Rp 12.000.000 – Rp 18.000.000 / month", "From Rp …", "Up to Rp …";
 * null when neither bound is set.
 */
export function formatSalaryRange(min: number | null | undefined, max: number | null | undefined): string | null {
  const hasMin = min !== null && min !== undefined;
  const hasMax = max !== null && max !== undefined;
  if (hasMin && hasMax) {
    return min === max ? `${formatIdr(min)} / month` : `${formatIdr(min)} – ${formatIdr(max)} / month`;
  }
  if (hasMin) return `From ${formatIdr(min)} / month`;
  if (hasMax) return `Up to ${formatIdr(max)} / month`;
  return null;
}

// ---------- WIB (Asia/Jakarta) ----------

const WIB = "Asia/Jakarta";
const wibDateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: WIB, day: "numeric", month: "short", year: "numeric" });
const wibShortDateFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: WIB, day: "numeric", month: "short" });
const wibTimeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: WIB, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const weekdayFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const utcDayFormatter = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "31 Oct 2026, 08:00 WIB" for an ISO timestamp, always in Jakarta time. */
export function formatDateTimeWib(value: string | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? `${wibDateFormatter.format(date)}, ${wibTimeFormatter.format(date)} WIB` : fallback;
}

/** "31 Oct 2026" for an ISO timestamp, in Jakarta time. */
export function formatDateWib(value: string | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? wibDateFormatter.format(date) : fallback;
}

/** Compact "31 Oct, 08:00" (Jakarta time) for tables. */
export function formatShortDateTimeWib(value: string | null | undefined, fallback = "—"): string {
  const date = toDate(value);
  return date ? `${wibShortDateFormatter.format(date)}, ${wibTimeFormatter.format(date)}` : fallback;
}

/** "YYYY-MM-DD" + n days -> "YYYY-MM-DD" (pure calendar arithmetic, no timezone shifts). */
export function addCalendarDays(day: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

/** "2026-10-31" -> "Sat, 31 Oct 2026". */
export function formatDayWithWeekday(day: string | null | undefined, fallback = "—"): string {
  const match = day ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(day) : null;
  if (!match) return fallback;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return `${weekdayFormatter.format(date)}, ${utcDayFormatter.format(date)}`;
}
