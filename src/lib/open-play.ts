import { prisma } from "./db";
import { getScheduleConfig } from "./booking";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";

export interface OpenPlaySession {
  entryId: string;
  title: string;
  startTime: Date;
  endTime: Date;
  courtIds: string[];
  maxPlayers: number;
  priceValue: number;
  spotsLeft: number;
  spotsTaken: number;
}

/**
 * List all open play sessions available for a given venue + date.
 * Counts only active registrations (confirmed status, payment not expired).
 */
export async function resolveOpenPlaySessions(
  venueId: string,
  date: Date
): Promise<OpenPlaySession[]> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { settings: true },
  });
  if (!venue) return [];

  const schedule = getScheduleConfig(venue.settings as Record<string, unknown>);
  const dayOfWeek = date.getDay();

  const openPlayEntries = schedule.entries.filter(
    (e) =>
      e.type === "open_play" &&
      e.daysOfWeek.includes(dayOfWeek) &&
      e.maxPlayers != null &&
      e.maxPlayers > 0
  );

  if (openPlayEntries.length === 0) return [];

  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  // Fetch all registrations for this venue + date in one query
  const registrations = await prisma.openPlayRegistration.findMany({
    where: {
      venueId,
      date: dateOnly,
      status: "confirmed",
      OR: [
        { paymentStatus: { in: ["proof_submitted", "paid"] } },
        { paymentStatus: "pending", holdExpiresAt: { gt: new Date() } },
      ],
    },
    select: { scheduleEntryId: true },
  });

  return openPlayEntries.map((entry) => {
    const startTime = new Date(dateOnly);
    startTime.setHours(entry.startHour, 0, 0, 0);
    const endTime = new Date(dateOnly);
    endTime.setHours(entry.endHour, 0, 0, 0);

    const spotsTaken = registrations.filter(
      (r) => r.scheduleEntryId === entry.id
    ).length;
    const maxPlayers = entry.maxPlayers!;
    const spotsLeft = Math.max(0, maxPlayers - spotsTaken);

    return {
      entryId: entry.id,
      title: entry.title,
      startTime,
      endTime,
      courtIds: entry.courtIds,
      maxPlayers,
      priceValue: entry.priceValue ?? 0,
      spotsLeft,
      spotsTaken,
    };
  });
}

/**
 * Register a player for an open play session.
 * Runs inside a transaction to prevent over-capacity bookings (409 if full).
 * Returns the created registration or throws if capacity exceeded.
 */
export async function createOpenPlayRegistration(
  playerId: string,
  venueId: string,
  scheduleEntryId: string,
  date: Date
) {
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { settings: true },
  });
  if (!venue) throw Object.assign(new Error("Venue not found"), { status: 404 });

  const schedule = getScheduleConfig(venue.settings as Record<string, unknown>);
  const entry = schedule.entries.find((e) => e.id === scheduleEntryId);
  if (!entry || entry.type !== "open_play") {
    throw Object.assign(new Error("Schedule entry not found"), { status: 404 });
  }

  const startTime = new Date(dateOnly);
  startTime.setHours(entry.startHour, 0, 0, 0);
  const endTime = new Date(dateOnly);
  endTime.setHours(entry.endHour, 0, 0, 0);

  const dayOfWeek = dateOnly.getDay();
  if (!entry.daysOfWeek.includes(dayOfWeek)) {
    throw Object.assign(new Error("Session not available on this day"), { status: 400 });
  }

  if (!entry.maxPlayers || entry.maxPlayers < 1) {
    throw Object.assign(new Error("This session does not accept bookings"), { status: 400 });
  }

  const priceValue = entry.priceValue ?? 0;
  const holdExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

  // Generate payment ref before the transaction to avoid nested Prisma client calls
  const paymentRef = await generatePaymentRef("open-play");

  return prisma.$transaction(async (tx) => {
    // Re-count active spots inside transaction to prevent race conditions
    const spotsTaken = await tx.openPlayRegistration.count({
      where: {
        scheduleEntryId,
        date: dateOnly,
        status: "confirmed",
        OR: [
          { paymentStatus: { in: ["proof_submitted", "paid"] } },
          { paymentStatus: "pending", holdExpiresAt: { gt: new Date() } },
        ],
      },
    });

    if (spotsTaken >= entry.maxPlayers!) {
      throw Object.assign(new Error("Session is full"), { status: 409 });
    }

    return tx.openPlayRegistration.create({
      data: {
        venueId,
        scheduleEntryId,
        date: dateOnly,
        startTime,
        endTime,
        playerId,
        priceValue,
        paymentStatus: "pending",
        holdExpiresAt,
        paymentRef,
        status: "confirmed",
      },
    });
  });
}
