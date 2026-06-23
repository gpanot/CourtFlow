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
 * Converts a "YYYY-MM-DD" string to a Date at UTC midnight.
 * This is what Prisma / the pg driver needs when writing a PostgreSQL DATE column:
 * the driver serialises the Date as an ISO string; UTC midnight maps to the correct
 * calendar day in the DB regardless of the server timezone.
 *
 * Use parseDateKey() for local date arithmetic (day-of-week, hour extraction, display).
 * Use toDbDate() only at the Prisma write boundary.
 */
export function toDbDate(s: string): Date {
  return new Date(s); // "YYYY-MM-DD" → ISO 8601 date-only → UTC midnight per spec
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
