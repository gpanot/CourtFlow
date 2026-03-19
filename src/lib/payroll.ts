/**
 * Round raw minutes UP to the nearest 30-minute block, return as decimal hours.
 * 200min -> 3.5h | 225min -> 4.0h | 180min -> 3.0h | 181min -> 3.5h | 0min -> 0h
 */
export function roundHoursUp(rawMinutes: number): number {
  if (rawMinutes <= 0) return 0;
  return Math.ceil(rawMinutes / 30) / 2;
}

/**
 * Calculate raw duration in minutes between two dates.
 */
export function durationMinutes(openedAt: Date, closedAt: Date): number {
  return Math.floor((closedAt.getTime() - openedAt.getTime()) / 60000);
}

/**
 * Given a date, return the Monday of that ISO week at 00:00:00 UTC.
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Return Monday 00:00:00 and Sunday 23:59:59.999 of the week.
 */
export function getWeekRange(weekStart: Date): { start: Date; end: Date } {
  const start = new Date(weekStart);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Format decimal hours for display: 3.5 -> "3.5 h" | 3.0 -> "3.0 h"
 */
export function formatHours(hours: number): string {
  return `${hours.toFixed(1)} h`;
}

/**
 * Format raw minutes for display: 200 -> "3h 20m" | 180 -> "3h 00m"
 */
export function formatRawDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/**
 * Validate that a date string represents a Monday.
 */
export function isMonday(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.getUTCDay() === 1;
}

/**
 * Parse a YYYY-MM-DD string into a UTC Date at midnight.
 */
export function parseWeekStart(dateStr: string): Date {
  return new Date(dateStr + "T00:00:00Z");
}

/**
 * Format a date as "Mon Mar 9" style label.
 */
export function formatDayLabel(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getUTCDay()]} ${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/**
 * Format a week range as "Mar 9 – Mar 15, 2026".
 */
export function formatWeekLabel(weekStart: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  const startMonth = months[weekStart.getUTCMonth()];
  const endMonth = months[end.getUTCMonth()];
  const year = end.getUTCFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getUTCDate()} – ${end.getUTCDate()}, ${year}`;
  }
  return `${startMonth} ${weekStart.getUTCDate()} – ${endMonth} ${end.getUTCDate()}, ${year}`;
}

/**
 * Format a short week range: "Mar 9–15" or "Mar 9 – Apr 1".
 */
export function formatWeekRangeShort(weekStart: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  const startMonth = months[weekStart.getUTCMonth()];
  const endMonth = months[end.getUTCMonth()];
  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getUTCDate()}–${end.getUTCDate()}`;
  }
  return `${startMonth} ${weekStart.getUTCDate()} – ${endMonth} ${end.getUTCDate()}`;
}

/**
 * Format date as YYYY-MM-DD.
 */
export function formatDateISO(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Format time from a Date as HH:MM.
 */
export function formatTime(date: Date): string {
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}
