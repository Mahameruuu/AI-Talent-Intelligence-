const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2021-03" -> "Mar 2021", "2021" -> "2021", "present" -> "Present". Returns null for null. */
export function formatYearMonth(value: string | null): string | null {
  if (value === null || value.trim() === "") return null;
  if (value.toLowerCase() === "present") return "Present";
  const match = /^(\d{4})(?:-(\d{1,2}))?/.exec(value.trim());
  if (!match) return value;
  const [, year, month] = match;
  if (!month) return year ?? value;
  const monthIndex = Number(month) - 1;
  return `${MONTHS[monthIndex] ?? month} ${year}`;
}
