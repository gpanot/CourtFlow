import { prisma } from "./db";
import type { Booking, PricingGroup } from "@prisma/client";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { parseDateKey, toDateKey } from "./date";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

// ─── Grid constant ─────────────────────────────────────────────────────────────
/**
 * Internal scheduling granularity — fixed at 30 minutes.
 * This is NOT configurable per venue. It is the smallest unit of time used for
 * slot generation, conflict checks, and span calculations.
 *
 * Bookable durations are multiples of this value:
 *   - Min court (player): 60 min (2 cells) unless allow30MinBookings is enabled
 *   - Min court (staff):  30 min (1 cell) — no restriction
 *   - Min coach lesson:   60 min (always; coach packages define durationMin)
 */
export const GRID_GRANULARITY_MINUTES = 30;

// ─── Types ─────────────────────────────────────────────────────────────────────

/**
 * A pricing rule for a specific day-of-week + hour range.
 * dayOfWeek: 0=Sunday … 6=Saturday (JS Date.getDay() convention).
 * Prices are per full hour; half-hour slots are priced at 0.5× the hourly rate.
 */
export interface PricingRule {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  priceValue: number;
}

export interface BookingConfig {
  /** @deprecated Grid is always 30 min. Kept for backward-compat JSON parsing only. */
  slotDurationMinutes: number;
  bookingStartHour: number;
  bookingEndHour: number;
  /**
   * @deprecated Pricing now comes from PricingGroup rows.
   * Kept for legacy fallback parsing only. Do not use in new code.
   */
  defaultPriceValue: number;
  /**
   * @deprecated Pricing now comes from PricingGroup rows.
   * Kept for legacy fallback parsing only. Do not use in new code.
   */
  pricingRules: PricingRule[];
  cancellationHours: number;
  /** Allow bookings shorter than 1 hour (1 cell = 30 min). Default false. */
  allow30MinBookings: boolean;
  /** Minimum booking duration in minutes for players. 60 (default) or 30 when allow30Min is on. */
  defaultDurationMinutes: number;
  /** Maximum booking duration in minutes. Default 720 (12h). */
  maxDurationMinutes: number;
  /** Allow players to book multiple courts in one group booking. Default true. */
  allowMultiCourtBookings: boolean;
  /** Maximum number of courts per group booking. Default 4. */
  maxCourtsPerBooking: number;
}

// ─── Pricing matrix types ──────────────────────────────────────────────────────

/**
 * A self-contained pricing matrix: a default price and a list of day/hour override rules.
 * Stored in PricingGroup rows and optionally as courts.price_override.
 */
export interface PricingMatrix {
  defaultPriceValue: number;
  pricingRules: PricingRule[];
}

/**
 * Result of resolving which pricing matrix applies to a specific court.
 * source describes where the matrix came from (for debug / admin display).
 */
export interface ResolvedCourtPricing {
  matrix: PricingMatrix;
  source: "override" | "group" | "default_group" | "legacy";
  groupId?: string;
  groupName?: string;
}

/**
 * Normalise a raw JSON blob into a PricingMatrix, handling legacy key names.
 */
export function parsePricingMatrix(raw: Record<string, unknown>): PricingMatrix {
  const rules = Array.isArray(raw.pricingRules)
    ? (raw.pricingRules as Record<string, unknown>[]).map((r) => ({
        dayOfWeek: r.dayOfWeek as number,
        startHour: r.startHour as number,
        endHour: r.endHour as number,
        priceValue: (r.priceValue as number) ?? (r.priceInCents as number) ?? 0,
      }))
    : [];

  const defaultPriceValue =
    (raw.defaultPriceValue as number) ??
    (raw.defaultPriceInCents as number) ??
    (raw.pricePerSlotCents as number) ??
    0;

  return { defaultPriceValue, pricingRules: rules };
}

/**
 * Resolve which pricing matrix applies to a court.
 *
 * Priority order (highest wins):
 *   1. court.priceOverride — frozen full-replace snapshot set by admin.
 *      NOTE: Changing pricing_group_id while an override is active has NO effect
 *      on prices until the override is cleared. This is intentional; the UI warns
 *      admins about this.
 *   2. court.pricingGroupId → matching PricingGroup row
 *   3. The venue's default PricingGroup (is_default = true)
 *   4. Legacy fallback: legacyBookingConfig.{defaultPriceValue, pricingRules}
 *
 * Pass pre-fetched groups to avoid extra DB queries inside tight loops.
 */
export function resolveCourtPricingMatrix(
  court: { pricingGroupId?: string | null; priceOverride?: unknown },
  groups: Pick<PricingGroup, "id" | "name" | "isDefault" | "defaultPriceValue" | "pricingRules">[],
  legacyBookingConfig?: { defaultPriceValue: number; pricingRules: PricingRule[] },
): ResolvedCourtPricing {
  // 1. Per-court override wins — it is a frozen snapshot independent of the group.
  if (court.priceOverride && typeof court.priceOverride === "object") {
    return {
      matrix: parsePricingMatrix(court.priceOverride as Record<string, unknown>),
      source: "override",
    };
  }

  // 2. Assigned group
  if (court.pricingGroupId) {
    const group = groups.find((g) => g.id === court.pricingGroupId);
    if (group) {
      return {
        matrix: parsePricingMatrix({
          defaultPriceValue: group.defaultPriceValue,
          pricingRules: group.pricingRules,
        } as Record<string, unknown>),
        source: group.isDefault ? "default_group" : "group",
        groupId: group.id,
        groupName: group.name,
      };
    }
  }

  // 3. Venue default group (fallback when court has no assignment yet)
  const defaultGroup = groups.find((g) => g.isDefault);
  if (defaultGroup) {
    return {
      matrix: parsePricingMatrix({
        defaultPriceValue: defaultGroup.defaultPriceValue,
        pricingRules: defaultGroup.pricingRules,
      } as Record<string, unknown>),
      source: "default_group",
      groupId: defaultGroup.id,
      groupName: defaultGroup.name,
    };
  }

  // 4. Legacy fallback: settings.bookingConfig pricing keys still present in JSON.
  if (legacyBookingConfig) {
    return {
      matrix: {
        defaultPriceValue: legacyBookingConfig.defaultPriceValue,
        pricingRules: legacyBookingConfig.pricingRules,
      },
      source: "legacy",
    };
  }

  return { matrix: { defaultPriceValue: 0, pricingRules: [] }, source: "legacy" };
}

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  slotDurationMinutes: 60,
  bookingStartHour: 8,
  bookingEndHour: 22,
  defaultPriceValue: 0,
  pricingRules: [],
  cancellationHours: 24,
  allow30MinBookings: false,
  defaultDurationMinutes: 60,
  maxDurationMinutes: 720,
  allowMultiCourtBookings: true,
  maxCourtsPerBooking: 4,
};

export interface ScheduleEntry {
  id: string;
  daysOfWeek: number[];
  startHour: number;
  endHour: number;
  courtIds: string[];
  type: "open_play" | "competition";
  title: string;
  /** open_play only: max total participants per session instance */
  maxPlayers?: number;
  /** open_play only: per-player price in whole VND */
  priceValue?: number;
}

export interface ScheduleConfig {
  entries: ScheduleEntry[];
}

export const DEFAULT_SCHEDULE_CONFIG: ScheduleConfig = { entries: [] };

export function getScheduleConfig(venueSettings: Record<string, unknown>): ScheduleConfig {
  const raw = venueSettings?.scheduleConfig as { entries?: Record<string, unknown>[] } | undefined;
  if (!raw?.entries) return DEFAULT_SCHEDULE_CONFIG;
  return {
    entries: raw.entries.map((e) => ({
      ...e,
      daysOfWeek: Array.isArray(e.daysOfWeek)
        ? e.daysOfWeek
        : typeof e.dayOfWeek === "number" ? [e.dayOfWeek] : [],
    })) as ScheduleEntry[],
  };
}

export interface MembershipConfig {
  contactWhatsApp: string | null;
  contactEmail: string | null;
}

export const DEFAULT_MEMBERSHIP_CONFIG: MembershipConfig = {
  contactWhatsApp: null,
  contactEmail: null,
};

export interface TimeSlot {
  startTime: string;
  endTime: string;
  /** Floor hour of the slot start — used for pricing bucket lookup. */
  hour: number;
  /**
   * Price for this 30-min cell = 0.5 × hourlyRate(startHour).
   * Sum selected cell priceValues to get booking total — matches resolveBookingPrice().
   */
  priceValue: number;
}

export interface SlotBlockInfo {
  blockId: string;
  type: string;
  title: string | null;
}

export interface SlotScheduleInfo {
  entryId: string;
  type: "open_play" | "competition";
  title: string;
}

export interface SlotLessonInfo {
  lessonId: string;
  coachName: string;
  playerName: string;
  lessonType: string;
  packageName: string;
}

export interface CourtSlot {
  courtId: string;
  courtLabel: string;
  slots: (TimeSlot & { available: boolean; block?: SlotBlockInfo; schedule?: SlotScheduleInfo; lesson?: SlotLessonInfo })[];
}

// ─── Config helpers ────────────────────────────────────────────────────────────

export function getBookingConfig(venueSettings: Record<string, unknown>): BookingConfig {
  const raw = venueSettings?.bookingConfig as Record<string, unknown> | undefined;
  if (!raw) return DEFAULT_BOOKING_CONFIG;

  const pricingRules = Array.isArray(raw.pricingRules)
    ? (raw.pricingRules as Record<string, unknown>[]).map((rule) => ({
        dayOfWeek: rule.dayOfWeek as number,
        startHour: rule.startHour as number,
        endHour: rule.endHour as number,
        priceValue:
          (rule.priceValue as number) ??
          (rule.priceInCents as number) ??
          0,
      }))
    : DEFAULT_BOOKING_CONFIG.pricingRules;

  return {
    slotDurationMinutes: (raw.slotDurationMinutes as number) ?? DEFAULT_BOOKING_CONFIG.slotDurationMinutes,
    bookingStartHour: (raw.bookingStartHour as number) ?? DEFAULT_BOOKING_CONFIG.bookingStartHour,
    bookingEndHour: (raw.bookingEndHour as number) ?? DEFAULT_BOOKING_CONFIG.bookingEndHour,
    defaultPriceValue:
      (raw.defaultPriceValue as number) ??
      (raw.defaultPriceInCents as number) ??
      (raw.pricePerSlotCents as number) ??
      DEFAULT_BOOKING_CONFIG.defaultPriceValue,
    pricingRules,
    cancellationHours: (raw.cancellationHours as number) ?? DEFAULT_BOOKING_CONFIG.cancellationHours,
    allow30MinBookings: (raw.allow30MinBookings as boolean) ?? DEFAULT_BOOKING_CONFIG.allow30MinBookings,
    defaultDurationMinutes: (raw.defaultDurationMinutes as number) ?? DEFAULT_BOOKING_CONFIG.defaultDurationMinutes,
    maxDurationMinutes: (raw.maxDurationMinutes as number) ?? DEFAULT_BOOKING_CONFIG.maxDurationMinutes,
    allowMultiCourtBookings: (raw.allowMultiCourtBookings as boolean) ?? DEFAULT_BOOKING_CONFIG.allowMultiCourtBookings,
    maxCourtsPerBooking: (raw.maxCourtsPerBooking as number) ?? DEFAULT_BOOKING_CONFIG.maxCourtsPerBooking,
  };
}

export function getMembershipConfig(venueSettings: Record<string, unknown>): MembershipConfig {
  const cfg = venueSettings?.membershipConfig as Partial<MembershipConfig> | undefined;
  return { ...DEFAULT_MEMBERSHIP_CONFIG, ...cfg };
}

// ─── Pricing ───────────────────────────────────────────────────────────────────

/**
 * Resolve the hourly price for a given day-of-week + hour bucket.
 * Matches the first pricing rule whose range covers `hour`.
 * Falls back to defaultPriceValue if no rule matches.
 *
 * Accepts either a BookingConfig (legacy) or a PricingMatrix (new).
 */
export function resolveSlotPrice(config: BookingConfig | PricingMatrix, dayOfWeek: number, hour: number): number {
  for (const rule of config.pricingRules) {
    if (rule.dayOfWeek === dayOfWeek && hour >= rule.startHour && hour < rule.endHour) {
      return rule.priceValue;
    }
  }
  return config.defaultPriceValue;
}

/**
 * Compute the total price for a booking spanning [startTime, startTime + durationMinutes)
 * using a PricingMatrix (from a PricingGroup or court.priceOverride).
 *
 * Pricing rule (half-hour bands):
 *   Each 30-min cell costs 0.5 × hourlyRate(cellStartHour).
 */
export function resolveCourtBookingPrice(
  matrix: PricingMatrix,
  startTime: Date,
  durationMinutes: number,
  venueTimezone: string,
): number {
  const cells = durationMinutes / GRID_GRANULARITY_MINUTES;
  let total = 0;
  for (let i = 0; i < cells; i++) {
    const cellStart = new Date(startTime.getTime() + i * GRID_GRANULARITY_MINUTES * 60 * 1000);
    const zonedCell = toZonedTime(cellStart, venueTimezone);
    total += resolveSlotPrice(matrix, zonedCell.getDay(), zonedCell.getHours()) / 2;
  }
  return Math.round(total);
}

/**
 * Compute the total price for a booking spanning [startTime, startTime + durationMinutes).
 *
 * Pricing rule (half-hour bands):
 *   Each 30-min cell costs 0.5 × hourlyRate(cellStartHour).
 *   Example: 18:00–19:30 with 100k@18h + 200k@19h
 *     → 100k (18:00–19:00) + 0.5×200k (19:00–19:30) = 200k total
 *
 * This function is the server-side source of truth for booking prices.
 * Client-side priceValue on TimeSlot cells (= 0.5 × hourlyRate) should sum to the same result.
 *
 * @deprecated Prefer resolveCourtBookingPrice(matrix, ...) with a per-court resolved matrix.
 *   This overload remains for call sites that already have a BookingConfig.
 */
export function resolveBookingPrice(
  config: BookingConfig,
  startTime: Date,
  durationMinutes: number,
  venueTimezone: string
): number {
  const cells = durationMinutes / GRID_GRANULARITY_MINUTES;
  let total = 0;
  for (let i = 0; i < cells; i++) {
    const cellStart = new Date(startTime.getTime() + i * GRID_GRANULARITY_MINUTES * 60 * 1000);
    const zonedCell = toZonedTime(cellStart, venueTimezone);
    const dayOfWeek = zonedCell.getDay();
    const hour = zonedCell.getHours();
    total += resolveSlotPrice(config, dayOfWeek, hour) / 2;
  }
  return Math.round(total);
}

// ─── Overlap helper ────────────────────────────────────────────────────────────

/**
 * Returns true when two half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap.
 */
export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart;
}

// ─── Start-time validation ─────────────────────────────────────────────────────

/**
 * A valid grid start time has local minutes of exactly 0 or 30.
 * Rejects :15, :45 etc. which would create misaligned 30-min slots.
 */
export function isValidGridStartTime(startTime: Date, venueTimezone: string): boolean {
  const zoned = toZonedTime(startTime, venueTimezone);
  const min = zoned.getMinutes();
  return min === 0 || min === 30;
}

// ─── Duration validation ───────────────────────────────────────────────────────

export type BookingContext = "player" | "staff";

/**
 * Validate the number of 30-min grid cells selected.
 *
 * Player rules:
 *   - min 2 cells (60 min) by default
 *   - min 1 cell (30 min) if config.allow30MinBookings
 *   - max maxDurationMinutes / 30
 *
 * Staff rules:
 *   - min 1 cell (no restriction)
 *   - max maxDurationMinutes / 30
 */
export function validateBookingDuration(
  config: BookingConfig,
  gridCellCount: number,
  context: BookingContext
): { valid: boolean; error?: string } {
  const maxCells = Math.floor(config.maxDurationMinutes / GRID_GRANULARITY_MINUTES);
  const minCells = context === "player" && !config.allow30MinBookings ? 2 : 1;

  if (gridCellCount < minCells) {
    const minMin = minCells * GRID_GRANULARITY_MINUTES;
    return { valid: false, error: `Minimum booking duration is ${minMin} minutes` };
  }
  if (gridCellCount > maxCells) {
    return { valid: false, error: `Maximum booking duration is ${config.maxDurationMinutes} minutes` };
  }
  return { valid: true };
}

// ─── Slot generation ───────────────────────────────────────────────────────────

/**
 * Generate 30-min time slots for a given local-midnight date.
 *
 * Grid granularity is always GRID_GRANULARITY_MINUTES (30).
 * Each cell priceValue = 0.5 × hourlyRate so summing cells equals resolveBookingPrice().
 * No slot is emitted when the cell would extend past bookingEndHour.
 *
 * Accepts either a BookingConfig (legacy) or a separate matrix + hour bounds.
 */
function generateTimeSlots(localMidnight: Date, config: BookingConfig, venueTimezone: string): TimeSlot[] {
  return generateTimeSlotsForMatrix(
    localMidnight,
    { defaultPriceValue: config.defaultPriceValue, pricingRules: config.pricingRules },
    { bookingStartHour: config.bookingStartHour, bookingEndHour: config.bookingEndHour },
    venueTimezone,
  );
}

/**
 * Generate 30-min slots using an explicit PricingMatrix and venue hour bounds.
 * This is the canonical slot generator for per-court pricing group support.
 */
export function generateTimeSlotsForMatrix(
  localMidnight: Date,
  matrix: PricingMatrix,
  venueHours: { bookingStartHour: number; bookingEndHour: number },
  venueTimezone: string,
): TimeSlot[] {
  const zonedDate = toZonedTime(localMidnight, venueTimezone);
  const dayOfWeek = zonedDate.getDay();
  const slots: TimeSlot[] = [];

  const endMs = (() => {
    const z = toZonedTime(localMidnight, venueTimezone);
    z.setHours(venueHours.bookingEndHour, 0, 0, 0);
    return fromZonedTime(z, venueTimezone).getTime();
  })();

  let cellIndex = 0;
  while (true) {
    const totalMinutes = venueHours.bookingStartHour * 60 + cellIndex * GRID_GRANULARITY_MINUTES;
    const cellHour = Math.floor(totalMinutes / 60);
    const cellMin = totalMinutes % 60;

    const zonedStart = toZonedTime(localMidnight, venueTimezone);
    zonedStart.setHours(cellHour, cellMin, 0, 0);
    const start = fromZonedTime(zonedStart, venueTimezone);
    const end = new Date(start.getTime() + GRID_GRANULARITY_MINUTES * 60 * 1000);

    if (end.getTime() > endMs) break;

    const hourlyRate = resolveSlotPrice(matrix, dayOfWeek, cellHour);

    slots.push({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      hour: cellHour,
      priceValue: Math.round(hourlyRate / 2),
    });

    cellIndex++;
  }

  return slots;
}

// ─── Consecutive span helper ───────────────────────────────────────────────────

/**
 * Find the index of the first available run of `cellCount` consecutive slots
 * starting at `startIndex` in a slot array.
 * Returns the starting index of the run, or -1 if no such run exists.
 */
export function findConsecutiveAvailableSpan(
  slots: { startTime: string; endTime: string; available: boolean }[],
  startIndex: number,
  cellCount: number
): number {
  for (let i = startIndex; i <= slots.length - cellCount; i++) {
    if (!slots[i].available) continue;
    let ok = true;
    for (let j = 1; j < cellCount; j++) {
      if (
        !slots[i + j].available ||
        slots[i + j].startTime !== slots[i + j - 1].endTime
      ) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

// ─── Availability query ────────────────────────────────────────────────────────

/**
 * Get available booking slots for a venue on a given date.
 * Returns a matrix of courts × time slots with availability and price.
 * All time calculations use the venue's stored timezone — server process TZ is irrelevant.
 *
 * Slots are always 30-min cells (GRID_GRANULARITY_MINUTES).
 * Availability rules:
 *   - Bookings: any overlap with existing confirmed/completed booking blocks the cell
 *   - Court blocks: any overlap blocks the cell
 *   - Schedule (open play/competition): hourly config; any overlap of the cell with
 *     the schedule window blocks it
 *   - Coach lessons: any overlap blocks the cell
 */
export async function getAvailableSlots(
  venueId: string,
  date: Date
): Promise<CourtSlot[]> {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { settings: true, timezone: true },
  });

  const venueTimezone = venue.timezone ?? "Asia/Ho_Chi_Minh";
  const vs = venue.settings as Record<string, unknown>;
  const config = getBookingConfig(vs);
  const schedule = getScheduleConfig(vs);

  // Load pricing groups for per-court matrix resolution
  const pricingGroups = await prisma.pricingGroup.findMany({
    where: { venueId },
    select: { id: true, name: true, isDefault: true, defaultPriceValue: true, pricingRules: true },
  });

  const courts = await prisma.court.findMany({
    where: { venueId, isBookable: true },
    orderBy: { label: "asc" },
    select: {
      id: true,
      label: true,
      status: true,
      activeInSession: true,
      isBookable: true,
      skipWarmupAfterMaintenance: true,
      venueId: true,
      pricingGroupId: true,
      priceOverride: true,
    },
  });

  // Noon local (UTC+7) → 05:00 UTC → same calendar date as what is stored.
  const dateKey = toDateKey(date);
  const dateOnly = new Date(dateKey + "T12:00:00+07:00");

  const existingBookings = await prisma.booking.findMany({
    where: {
      venueId,
      date: dateOnly,
      status: { in: ["confirmed", "completed"] },
      OR: [
        { holdExpiresAt: null },
        { holdExpiresAt: { gt: new Date() } },
        { paymentStatus: { not: "pending" } },
      ],
    },
    select: { courtId: true, startTime: true, endTime: true },
  });

  const courtBlocks = await prisma.courtBlock.findMany({
    where: { venueId, date: dateOnly },
    select: { id: true, type: true, title: true, courtIds: true, startTime: true, endTime: true },
  });

  const coachLessons = await prisma.coachLesson.findMany({
    where: {
      venueId,
      date: dateOnly,
      status: { in: ["confirmed", "completed"] },
      courtId: { not: null },
    },
    select: {
      id: true,
      courtId: true,
      startTime: true,
      endTime: true,
      coach: { select: { name: true } },
      player: { select: { name: true } },
      package: { select: { name: true, lessonType: true } },
    },
  });

  const venueHours = { bookingStartHour: config.bookingStartHour, bookingEndHour: config.bookingEndHour };

  // Build schedule windows as timestamp ranges for any-overlap check
  const zonedDate = toZonedTime(dateOnly, venueTimezone);
  const dayOfWeek = zonedDate.getDay();
  const daySchedule = schedule.entries.filter((e) => e.daysOfWeek.includes(dayOfWeek));

  const scheduleWindows = daySchedule.map((entry) => {
    const startZ = toZonedTime(dateOnly, venueTimezone);
    startZ.setHours(entry.startHour, 0, 0, 0);
    const endZ = toZonedTime(dateOnly, venueTimezone);
    endZ.setHours(entry.endHour, 0, 0, 0);
    return {
      entry,
      startMs: fromZonedTime(startZ, venueTimezone).getTime(),
      endMs: fromZonedTime(endZ, venueTimezone).getTime(),
    };
  });

  const now = new Date();
  const zonedNow = toZonedTime(now, venueTimezone);
  const isToday =
    zonedDate.getFullYear() === zonedNow.getFullYear() &&
    zonedDate.getMonth() === zonedNow.getMonth() &&
    zonedDate.getDate() === zonedNow.getDate();

  // Cache slot arrays by group id (or "override:<hash>") to avoid N duplicate generations
  const slotCache = new Map<string, TimeSlot[]>();

  return courts.map((court) => {
    const { matrix } = resolveCourtPricingMatrix(court, pricingGroups, {
      defaultPriceValue: config.defaultPriceValue,
      pricingRules: config.pricingRules,
    });

    // Cache key: court override overrides by a hash of its JSON; otherwise use group id.
    let cacheKey: string;
    if (court.priceOverride) {
      cacheKey = "override:" + JSON.stringify(court.priceOverride);
    } else {
      cacheKey = court.pricingGroupId ?? "default";
    }

    let timeSlots = slotCache.get(cacheKey);
    if (!timeSlots) {
      timeSlots = generateTimeSlotsForMatrix(dateOnly, matrix, venueHours, venueTimezone);
      slotCache.set(cacheKey, timeSlots);
    }

    return {
    courtId: court.id,
    courtLabel: court.label,
    slots: timeSlots.map((slot) => {
      const slotStart = new Date(slot.startTime).getTime();
      const slotEnd = new Date(slot.endTime).getTime();

      // Block past slots — only block when end time has passed
      const isPast = isToday && slotEnd <= now.getTime();

      // Booking overlap: any existing booking whose window overlaps this cell
      const isBooked = existingBookings.some(
        (b) =>
          b.courtId === court.id &&
          intervalsOverlap(slotStart, slotEnd, b.startTime.getTime(), b.endTime.getTime())
      );

      // Court block overlap (timestamp-based, already correct)
      const matchingBlock = courtBlocks.find(
        (bl) =>
          bl.courtIds.includes(court.id) &&
          intervalsOverlap(slotStart, slotEnd, bl.startTime.getTime(), bl.endTime.getTime())
      );

      // Schedule overlap: any overlap of the 30-min cell with the hourly schedule window
      const matchingScheduleWindow = scheduleWindows.find(
        (sw) =>
          sw.entry.courtIds.includes(court.id) &&
          intervalsOverlap(slotStart, slotEnd, sw.startMs, sw.endMs)
      );

      // Coach lesson overlap (timestamp-based, already correct)
      const matchingLesson = coachLessons.find(
        (l) =>
          l.courtId === court.id &&
          intervalsOverlap(slotStart, slotEnd, l.startTime.getTime(), l.endTime.getTime())
      );

      return {
        ...slot,
        available: !isPast && !isBooked && !matchingBlock && !matchingScheduleWindow && !matchingLesson,
        ...(matchingBlock
          ? { block: { blockId: matchingBlock.id, type: matchingBlock.type, title: matchingBlock.title } }
          : {}),
        ...(matchingScheduleWindow && !matchingBlock
          ? { schedule: { entryId: matchingScheduleWindow.entry.id, type: matchingScheduleWindow.entry.type, title: matchingScheduleWindow.entry.title } }
          : {}),
        ...(matchingLesson
          ? {
              lesson: {
                lessonId: matchingLesson.id,
                coachName: matchingLesson.coach.name,
                playerName: matchingLesson.player.name,
                lessonType: matchingLesson.package.lessonType,
                packageName: matchingLesson.package.name,
              },
            }
          : {}),
      };
    }),
    };
  });
}

// ─── Availability helpers ──────────────────────────────────────────────────────

/**
 * Given a pre-fetched court availability matrix, returns true if at least one
 * court has an available slot that starts at the given whole hour.
 * Used by the coach availability probe (Phase 8).
 */
export function isAnyCourtAvailableAtHour(
  courtMatrix: CourtSlot[],
  hour: number
): boolean {
  return courtMatrix.some((court) =>
    court.slots.some((slot) => slot.hour === hour && slot.available)
  );
}

/**
 * Returns true if at least one court has N consecutive available 30-min cells
 * starting at startTime.
 */
export function isAnyCourtAvailableForDuration(
  courtMatrix: CourtSlot[],
  startTimeIso: string,
  durationMinutes: number
): boolean {
  const cells = Math.ceil(durationMinutes / GRID_GRANULARITY_MINUTES);
  return courtMatrix.some((court) => {
    const startIdx = court.slots.findIndex((s) => s.startTime === startTimeIso);
    if (startIdx === -1) return false;
    return findConsecutiveAvailableSpan(court.slots, startIdx, cells) === startIdx;
  });
}

// ─── Conflict validation (write path) ─────────────────────────────────────────

/**
 * Check whether a court is free for a booking spanning [startTime, endTime).
 * Returns true (no conflict) if no confirmed/completed booking overlaps the window.
 *
 * Note: call this inside the booking transaction to prevent TOCTOU races.
 */
export async function validateBookingConflict(
  courtId: string,
  date: Date,
  startTime: Date,
  endTime: Date
): Promise<boolean> {
  const existing = await prisma.booking.findFirst({
    where: {
      courtId,
      date,
      status: { in: ["confirmed", "completed"] },
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
  return existing === null;
}

// ─── Multi-court booking helpers ──────────────────────────────────────────────

export interface MultiCourtEntry {
  courtId: string;
  startTime: string; // ISO string
  slotCount: number;
}

export interface GroupPriceResult {
  total: number;
  perCourt: { courtId: string; priceValue: number }[];
}

/**
 * Validate a multi-court booking request.
 *
 * Rules:
 *  - At least 2 courts (if only 1, use the normal single-court path).
 *  - Each court's slotCount passes validateBookingDuration independently.
 *  - court count <= config.maxCourtsPerBooking.
 *  - No duplicate courtIds.
 *
 * Courts may have independent startTime / slotCount (e.g. Court 1: 10-11am,
 * Court 2: 1-3pm). The batch endpoint creates one booking per court grouped
 * under a shared bookingGroup.
 */
export function validateMultiCourtBooking(
  courts: MultiCourtEntry[],
  config: BookingConfig,
  context: BookingContext,
): { valid: boolean; error?: string } {
  if (courts.length < 2) {
    return { valid: false, error: "Multi-court booking requires at least 2 courts" };
  }
  if (courts.length > config.maxCourtsPerBooking) {
    return { valid: false, error: `Maximum ${config.maxCourtsPerBooking} courts per group booking` };
  }

  const uniqueIds = new Set(courts.map((c) => c.courtId));
  if (uniqueIds.size !== courts.length) {
    return { valid: false, error: "Duplicate courts in group booking" };
  }

  for (const c of courts) {
    const durationCheck = validateBookingDuration(config, c.slotCount, context);
    if (!durationCheck.valid) return durationCheck;
  }

  return { valid: true };
}

/**
 * Resolve the price for each court in a group booking and return the combined total.
 * Each court is priced independently using its own resolved pricing matrix.
 *
 * courtMatrices is a map of courtId → PricingMatrix; if a court has no entry
 * the function falls back to the legacy config.
 *
 * @deprecated (legacy overload) Pass courtMatrices instead. This overload is kept
 *   for call sites that have not yet been migrated to per-court pricing.
 */
export function resolveGroupBookingPrice(
  config: BookingConfig,
  courts: MultiCourtEntry[],
  venueTimezone: string,
  courtMatrices?: Map<string, PricingMatrix>,
): GroupPriceResult {
  const perCourt = courts.map((c) => {
    const matrix = courtMatrices?.get(c.courtId);
    const priceValue = matrix
      ? resolveCourtBookingPrice(matrix, new Date(c.startTime), c.slotCount * GRID_GRANULARITY_MINUTES, venueTimezone)
      : resolveBookingPrice(config, new Date(c.startTime), c.slotCount * GRID_GRANULARITY_MINUTES, venueTimezone);
    return { courtId: c.courtId, priceValue };
  });
  return {
    total: perCourt.reduce((sum, c) => sum + c.priceValue, 0),
    perCourt,
  };
}

// ─── Cancellation policy ───────────────────────────────────────────────────────

export interface CancellationResult {
  canCancel: boolean;
  hoursUntilStart: number;
  cancellationHours: number;
}

/**
 * Check whether a booking can be cancelled under the venue's cancellation policy.
 */
export async function checkCancellationPolicy(
  booking: Booking
): Promise<CancellationResult> {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: booking.venueId },
    select: { settings: true },
  });

  const config = getBookingConfig(venue.settings as Record<string, unknown>);
  const now = new Date();
  const hoursUntilStart = (booking.startTime.getTime() - now.getTime()) / (1000 * 60 * 60);

  return {
    canCancel: hoursUntilStart >= config.cancellationHours,
    hoursUntilStart: Math.max(0, hoursUntilStart),
    cancellationHours: config.cancellationHours,
  };
}
