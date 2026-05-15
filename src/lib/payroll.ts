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
 * Return Monday 00:00:00 and Sunday 23:59:59.999 of the week (UTC).
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
 * Format a date as "Mon Mar 9" style label (local time).
 */
export function formatDayLabel(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[date.getDay()]} ${months[date.getMonth()]} ${date.getDate()}`;
}

/**
 * Format a week range as "Mar 9 – Mar 15, 2026" (local time).
 */
export function formatWeekLabel(weekStart: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const startMonth = months[weekStart.getMonth()];
  const endMonth = months[end.getMonth()];
  const year = end.getFullYear();
  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getDate()} – ${end.getDate()}, ${year}`;
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
}

/**
 * Format a short week range: "Mar 9–15" or "Mar 9 – Apr 1" (local time).
 */
export function formatWeekRangeShort(weekStart: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const startMonth = months[weekStart.getMonth()];
  const endMonth = months[end.getMonth()];
  if (startMonth === endMonth) {
    return `${startMonth} ${weekStart.getDate()}–${end.getDate()}`;
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${end.getDate()}`;
}

/**
 * Format date as YYYY-MM-DD (local time).
 */
export function formatDateISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Format time from a Date as HH:MM (local time).
 */
export function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
