import { prisma } from "./db";
import type { Booking } from "@prisma/client";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import { toDateKey, toDbDate } from "./date";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * A pricing rule for a specific day-of-week + hour range.
 * dayOfWeek: 0=Sunday … 6=Saturday (JS Date.getDay() convention).
 */
export interface PricingRule {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  priceValue: number;
}

export interface BookingConfig {
  slotDurationMinutes: number;
  bookingStartHour: number;
  bookingEndHour: number;
  defaultPriceValue: number;
  pricingRules: PricingRule[];
  cancellationHours: number;
}

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  slotDurationMinutes: 60,
  bookingStartHour: 8,
  bookingEndHour: 22,
  defaultPriceValue: 0,
  pricingRules: [],
  cancellationHours: 24,
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
  hour: number;
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
  };
}

export function getMembershipConfig(venueSettings: Record<string, unknown>): MembershipConfig {
  const cfg = venueSettings?.membershipConfig as Partial<MembershipConfig> | undefined;
  return { ...DEFAULT_MEMBERSHIP_CONFIG, ...cfg };
}

/**
 * Resolve the price for a slot given the day of week and hour.
 * Matches the first pricing rule whose range covers `hour`.
 * Falls back to defaultPriceValue if no rule matches.
 */
export function resolveSlotPrice(config: BookingConfig, dayOfWeek: number, hour: number): number {
  for (const rule of config.pricingRules) {
    if (rule.dayOfWeek === dayOfWeek && hour >= rule.startHour && hour < rule.endHour) {
      return rule.priceValue;
    }
  }
  return config.defaultPriceValue;
}

/**
 * Generate time slots for a given local-midnight date using the venue's local timezone.
 * All hour arithmetic is done in venue-local time so the server's process TZ is irrelevant.
 */
function generateTimeSlots(localMidnight: Date, config: BookingConfig, venueTimezone: string): TimeSlot[] {
  // Convert the local midnight to the venue's local representation
  const zonedDate = toZonedTime(localMidnight, venueTimezone);
  const dayOfWeek = zonedDate.getDay();
  const slots: TimeSlot[] = [];

  for (let hour = config.bookingStartHour; hour < config.bookingEndHour; hour += config.slotDurationMinutes / 60) {
    const floorHour = Math.floor(hour);
    const minutes = Math.round((hour % 1) * 60);

    // Build a local-time wall-clock date in the venue's timezone, then convert to UTC
    const zonedStart = toZonedTime(localMidnight, venueTimezone);
    zonedStart.setHours(floorHour, minutes, 0, 0);
    const start = fromZonedTime(zonedStart, venueTimezone);

    const end = new Date(start.getTime() + config.slotDurationMinutes * 60 * 1000);

    slots.push({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      hour: floorHour,
      priceValue: resolveSlotPrice(config, dayOfWeek, floorHour),
    });
  }
  return slots;
}

/**
 * Get available booking slots for a venue on a given date.
 * Returns a matrix of courts x time slots with availability and price.
 * All time calculations use the venue's stored timezone — server process TZ is irrelevant.
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

  const courts = await prisma.court.findMany({
    where: { venueId, isBookable: true },
    orderBy: { label: "asc" },
  });

  // Use UTC midnight for Prisma DATE column queries (pg driver uses UTC portion of ISO string)
  const dateOnly = toDbDate(toDateKey(date));

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

  // Generate slots using the venue's timezone — completely process-TZ-independent
  const timeSlots = generateTimeSlots(dateOnly, config, venueTimezone);

  // Day-of-week in venue local time
  const zonedDate = toZonedTime(dateOnly, venueTimezone);
  const dayOfWeek = zonedDate.getDay();
  const daySchedule = schedule.entries.filter((e) => e.daysOfWeek.includes(dayOfWeek));

  // isPast: compare absolute timestamps — no timezone needed
  const now = new Date();
  // isToday: compare date in venue's local timezone
  const zonedNow = toZonedTime(now, venueTimezone);
  const isToday =
    zonedDate.getFullYear() === zonedNow.getFullYear() &&
    zonedDate.getMonth() === zonedNow.getMonth() &&
    zonedDate.getDate() === zonedNow.getDate();

  return courts.map((court) => ({
    courtId: court.id,
    courtLabel: court.label,
    slots: timeSlots.map((slot) => {
      const slotStart = new Date(slot.startTime).getTime();
      const slotEnd = new Date(slot.endTime).getTime();

      // Block past slots for today
      const isPast = isToday && slotStart <= now.getTime();

      const isBooked = existingBookings.some(
        (b) => b.courtId === court.id && slotStart >= b.startTime.getTime() && slotStart < b.endTime.getTime()
      );

      const matchingBlock = courtBlocks.find(
        (bl) =>
          bl.courtIds.includes(court.id) &&
          slotStart < bl.endTime.getTime() &&
          slotEnd > bl.startTime.getTime()
      );

      const matchingSchedule = daySchedule.find(
        (entry) =>
          entry.courtIds.includes(court.id) &&
          slot.hour >= entry.startHour &&
          slot.hour < entry.endHour
      );

      const matchingLesson = coachLessons.find(
        (l) =>
          l.courtId === court.id &&
          slotStart < l.endTime.getTime() &&
          slotEnd > l.startTime.getTime()
      );

      return {
        ...slot,
        available: !isPast && !isBooked && !matchingBlock && !matchingSchedule && !matchingLesson,
        ...(matchingBlock
          ? { block: { blockId: matchingBlock.id, type: matchingBlock.type, title: matchingBlock.title } }
          : {}),
        ...(matchingSchedule && !matchingBlock
          ? { schedule: { entryId: matchingSchedule.id, type: matchingSchedule.type, title: matchingSchedule.title } }
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
  }));
}

/**
 * Check if a specific court/date/time slot is available for booking.
 */
export async function validateBookingConflict(
  courtId: string,
  date: Date,
  startTime: Date
): Promise<boolean> {
  const existing = await prisma.booking.findFirst({
    where: {
      courtId,
      date,
      startTime,
      status: { in: ["confirmed", "completed"] },
    },
  });
  return existing === null;
}

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
