export const MIN_RETENTION_MONTHS = 1;
export const MAX_RETENTION_MONTHS = 36;

/** Validation message for the retention months field, or null when it is a whole number 1–36. */
export function monthsError(value: string): string | null {
  const n = Number(value);
  if (value.trim() === "" || !Number.isInteger(n) || n < MIN_RETENTION_MONTHS || n > MAX_RETENTION_MONTHS) {
    return `Enter a whole number from ${MIN_RETENTION_MONTHS} to ${MAX_RETENTION_MONTHS}.`;
  }
  return null;
}
