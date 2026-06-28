/**
 * Pure helpers for worker attendance (حضور وانصراف). Time parsing/formatting
 * kept here so it can be unit-tested without the DB/UI.
 */

/** Hours worked between two ISO timestamps, rounded to 2 decimals; 0 if invalid or open. */
export function hoursWorked(checkIn: string, checkOut?: string | null): number {
  if (!checkOut) return 0;
  const a = new Date(checkIn).getTime();
  const b = new Date(checkOut).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.round(((b - a) / 3_600_000) * 100) / 100;
}

/** "HH:MM" local time from an ISO timestamp, or "—". */
export function clockTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
