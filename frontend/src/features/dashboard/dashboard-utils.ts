const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "2026-11" -> "Nov 2026" (calendar month, no timezone shift). */
export function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return monthFormatter.format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

/** "closes today" / "closes tomorrow" / "closes in 3 days". */
export function closesIn(daysLeft: number): string {
  if (daysLeft <= 0) return "Closes today";
  if (daysLeft === 1) return "Closes tomorrow";
  return `Closes in ${daysLeft} days`;
}

/** Hire rate as a plain percentage, e.g. 33.3 -> "33%". */
export function formatRate(rate: number): string {
  return `${Math.round(rate)}%`;
}

/** Candidates table filtered to one job. */
export function candidatesHref(jobId: number): string {
  return `/candidates?job_id=${jobId}`;
}
