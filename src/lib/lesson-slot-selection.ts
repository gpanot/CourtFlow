/**
 * lesson-slot-selection.ts
 *
 * Pure helpers for coach lesson slot selection and validation.
 * Shared by StaffBookingModal (admin) and the player coach-booking page.
 *
 * Rules:
 *  - Internal grid granularity = 30 min (GRID_GRANULARITY_MINUTES).
 *  - A lesson package has a fixed durationMin (e.g. 60 or 90).
 *  - The number of 30-min grid cells that make up ONE lesson = durationMin / 30.
 *  - A valid selection is a non-zero multiple of cellsPerLesson.
 */

import { GRID_GRANULARITY_MINUTES } from "@/lib/booking";

/** Number of 30-min grid cells that constitute one lesson of this package. */
export function cellsPerLesson(pkg: { durationMin: number }): number {
  return pkg.durationMin / GRID_GRANULARITY_MINUTES;
}

export interface LessonValidationResult {
  valid: boolean;
  /** Nearest valid cell count >= selectedCount (or exactly cellsPerLesson when selectedCount is 0). */
  needed: number;
  errorMsg?: string;
}

/**
 * Validate that `selectedCount` 30-min cells form a whole multiple of
 * `pkg.durationMin`. Returns `valid: true` when the selection is good.
 */
export function validateLessonSelection(
  pkg: { durationMin: number; name: string },
  selectedCount: number,
): LessonValidationResult {
  const cells = cellsPerLesson(pkg);

  if (selectedCount <= 0) {
    return { valid: false, needed: cells, errorMsg: "Select at least one time slot." };
  }

  if (selectedCount % cells !== 0) {
    const needed = cells * Math.ceil(selectedCount / cells);
    return {
      valid: false,
      needed,
      errorMsg: `${pkg.name} is ${pkg.durationMin} min — select ${needed} cell${needed > 1 ? "s" : ""} (${fmtLessonDuration(needed * GRID_GRANULARITY_MINUTES)}) or a multiple thereof.`,
    };
  }

  return { valid: true, needed: selectedCount };
}

/**
 * Compute the lesson end ISO string from the start of the LAST selected slot
 * and the package duration.
 *
 * Note: `lastSlotStartISO` is the start of the last 30-min grid cell, not its end.
 * The lesson ends at `lastSlotStartISO + durationMin` so that a single 90-min
 * lesson starting at 10:00 ends at 11:30, not 11:00.
 */
export function lessonEndTime(
  lastSlotStartISO: string,
  pkg: { durationMin: number },
): string {
  return new Date(
    new Date(lastSlotStartISO).getTime() + pkg.durationMin * 60 * 1000,
  ).toISOString();
}

/**
 * Number of complete lesson sessions represented by the selected cells.
 * Assumes `selectedCount` has already been validated as a multiple of cellsPerLesson.
 */
export function lessonSessionCount(
  selectedCount: number,
  pkg: { durationMin: number },
): number {
  return selectedCount / cellsPerLesson(pkg);
}

/** Format a duration in minutes as e.g. "1h", "1h30", "30m". */
export function fmtLessonDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return h > 0 ? `${h}h${m}` : `${m}m`;
}

/**
 * Human-readable summary of the selected sessions.
 * e.g. "1 × 1h30" or "2 × 1h (2h total)"
 */
export function fmtLessonSummary(
  selectedCount: number,
  pkg: { durationMin: number },
): string {
  const sessions = lessonSessionCount(selectedCount, pkg);
  const durationLabel = fmtLessonDuration(pkg.durationMin);
  if (sessions === 1) return `1 × ${durationLabel}`;
  const totalMin = selectedCount * GRID_GRANULARITY_MINUTES;
  return `${sessions} × ${durationLabel} (${fmtLessonDuration(totalMin)} total)`;
}
