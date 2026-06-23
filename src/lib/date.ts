/**
 * Canonical date-only utilities for CourtFlow.
 *
 * RULE: calendar-day values (the date of a booking) travel as plain "YYYY-MM-DD"
 * strings everywhere — from UI selection through API bodies through Prisma DATE
 * columns through display. They NEVER pass through .toISOString() or
 * new Date("YYYY-MM-DD") with no explicit time, because both produce UTC midnight
 * which resolves to the previous calendar day in UTC+7.
 *
 * Only true timestamps (startTime, endTime) are ever Date objects or ISO strings.
 */

/**
 * Converts a Date object to a "YYYY-MM-DD" string using LOCAL calendar fields.
 * Safe to call on any Date; never uses UTC methods.
 */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parses a "YYYY-MM-DD" string into a Date at LOCAL midnight.
 * Equivalent to new Date(y, m-1, d) — never new Date("YYYY-MM-DD") which is UTC.
 */
export function parseDateKey(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Displays a "YYYY-MM-DD" date-only string for a user, safely.
 * Internally calls parseDateKey (local midnight) then toLocaleDateString.
 * Use this instead of formatDate() for any Prisma @db.Date field.
 */
export function formatDateKey(
  s: string,
  locale: string = "en-US",
  options: Intl.DateTimeFormatOptions = {
    weekday: "short",
    month: "short",
    day: "numeric",
  }
): string {
  return parseDateKey(s).toLocaleDateString(locale, options);
}
