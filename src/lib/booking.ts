import { prisma } from "./db";
import type { Booking } from "@prisma/client";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * A pricing rule for a specific day-of-week + hour range.
 * dayOfWeek: 0=Sunday … 6=Saturday (JS Date.getDay() convention).
 */
export interface PricingRule {
  dayOfWeek: number;
  startHour: number;
  endHour: number;
  priceInCents: number;
}

export interface BookingConfig {
  slotDurationMinutes: number;
  bookingStartHour: number;
  bookingEndHour: number;
  defaultPriceInCents: number;
  pricingRules: PricingRule[];
  cancellationHours: number;
}

export const DEFAULT_BOOKING_CONFIG: BookingConfig = {
  slotDurationMinutes: 60,
  bookingStartHour: 8,
  bookingEndHour: 22,
  defaultPriceInCents: 0,
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
  priceInCents: number;
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

export interface CourtSlot {
  courtId: string;
  courtLabel: string;
  slots: (TimeSlot & { available: boolean; block?: SlotBlockInfo; schedule?: SlotScheduleInfo })[];
}

export function getBookingConfig(venueSettings: Record<string, unknown>): BookingConfig {
  const raw = venueSettings?.bookingConfig as Record<string, unknown> | undefined;
  if (!raw) return DEFAULT_BOOKING_CONFIG;
  return {
    slotDurationMinutes: (raw.slotDurationMinutes as number) ?? DEFAULT_BOOKING_CONFIG.slotDurationMinutes,
    bookingStartHour: (raw.bookingStartHour as number) ?? DEFAULT_BOOKING_CONFIG.bookingStartHour,
    bookingEndHour: (raw.bookingEndHour as number) ?? DEFAULT_BOOKING_CONFIG.bookingEndHour,
    defaultPriceInCents: (raw.defaultPriceInCents as number) ?? (raw.pricePerSlotCents as number) ?? DEFAULT_BOOKING_CONFIG.defaultPriceInCents,
    pricingRules: (raw.pricingRules as PricingRule[]) ?? DEFAULT_BOOKING_CONFIG.pricingRules,
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
 * Falls back to defaultPriceInCents if no rule matches.
 */
export function resolveSlotPrice(config: BookingConfig, dayOfWeek: number, hour: number): number {
  for (const rule of config.pricingRules) {
    if (rule.dayOfWeek === dayOfWeek && hour >= rule.startHour && hour < rule.endHour) {
      return rule.priceInCents;
    }
  }
  return config.defaultPriceInCents;
}

function generateTimeSlots(date: Date, config: BookingConfig): TimeSlot[] {
  const dayOfWeek = date.getDay();
  const slots: TimeSlot[] = [];
  for (let hour = config.bookingStartHour; hour < config.bookingEndHour; hour += config.slotDurationMinutes / 60) {
    const start = new Date(date);
    start.setHours(Math.floor(hour), (hour % 1) * 60, 0, 0);

    const end = new Date(start);
    end.setMinutes(end.getMinutes() + config.slotDurationMinutes);

    slots.push({
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      hour: Math.floor(hour),
      priceInCents: resolveSlotPrice(config, dayOfWeek, Math.floor(hour)),
    });
  }
  return slots;
}

/**
 * Get available booking slots for a venue on a given date.
 * Returns a matrix of courts x time slots with availability and price.
 */
export async function getAvailableSlots(
  venueId: string,
  date: Date
): Promise<CourtSlot[]> {
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { settings: true },
  });

  const vs = venue.settings as Record<string, unknown>;
  const config = getBookingConfig(vs);
  const schedule = getScheduleConfig(vs);

  const courts = await prisma.court.findMany({
    where: { venueId, isBookable: true },
    orderBy: { label: "asc" },
  });

  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  const nextDay = new Date(dateOnly);
  nextDay.setDate(nextDay.getDate() + 1);

  const existingBookings = await prisma.booking.findMany({
    where: {
      venueId,
      date: dateOnly,
      status: { in: ["confirmed", "completed"] },
    },
    select: { courtId: true, startTime: true, endTime: true },
  });

  const courtBlocks = await prisma.courtBlock.findMany({
    where: { venueId, date: dateOnly },
    select: { id: true, type: true, title: true, courtIds: true, startTime: true, endTime: true },
  });

  const timeSlots = generateTimeSlots(dateOnly, config);
  const dayOfWeek = dateOnly.getDay();
  const daySchedule = schedule.entries.filter((e) => e.daysOfWeek.includes(dayOfWeek));

  return courts.map((court) => ({
    courtId: court.id,
    courtLabel: court.label,
    slots: timeSlots.map((slot) => {
      const slotStart = new Date(slot.startTime).getTime();
      const slotEnd = new Date(slot.endTime).getTime();

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

      return {
        ...slot,
        available: !isBooked && !matchingBlock && !matchingSchedule,
        ...(matchingBlock
          ? { block: { blockId: matchingBlock.id, type: matchingBlock.type, title: matchingBlock.title } }
          : {}),
        ...(matchingSchedule && !matchingBlock
          ? { schedule: { entryId: matchingSchedule.id, type: matchingSchedule.type, title: matchingSchedule.title } }
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
