import { prisma } from "./db";
import { getScheduleConfig } from "./booking";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";

export interface OpenPlaySessionPlayer {
  name: string;
  initials: string;
  avatarColor: string;
  avatarPhotoPath: string | null;
  facePhotoPath: string | null;
  skillLevel: string | null;
  checkInCount: number;
}

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
  players: OpenPlaySessionPlayer[];
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

  // Fetch all registrations for this venue + date in one query, including player info
  let registrations: {
    scheduleEntryId: string;
    player: {
      name: string;
      skillLevel: string | null;
      avatarPhotoPath: string | null;
      facePhotoPath: string | null;
      queueEntries: { id: string }[];
    } | null;
  }[] = [];
  try {
    registrations = await prisma.openPlayRegistration.findMany({
      where: {
        venueId,
        date: dateOnly,
        status: "confirmed",
        OR: [
          { paymentStatus: { in: ["proof_submitted", "paid"] } },
          { paymentStatus: "pending", holdExpiresAt: { gt: new Date() } },
        ],
      },
      select: {
        scheduleEntryId: true,
        player: {
          select: {
            name: true,
            skillLevel: true,
            avatarPhotoPath: true,
            facePhotoPath: true,
            queueEntries: { select: { id: true }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  } catch {
    // Table missing or stale Prisma client — still show sessions with 0 spots taken
  }

  // Deterministic avatar colours (same palette as mobile RN app)
  const AVATAR_COLORS = [
    "#F28B82", "#FFB74D", "#FFD54F", "#A5D6A7",
    "#80CBC4", "#90CAF9", "#CE93D8", "#FFAB91",
  ];
  function avatarColor(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }
  function initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  return openPlayEntries.map((entry) => {
    const startTime = new Date(dateOnly);
    startTime.setHours(entry.startHour, 0, 0, 0);
    const endTime = new Date(dateOnly);
    endTime.setHours(entry.endHour, 0, 0, 0);

    const entryRegs = registrations.filter((r) => r.scheduleEntryId === entry.id);
    const spotsTaken = entryRegs.length;
    const maxPlayers = entry.maxPlayers!;
    const spotsLeft = Math.max(0, maxPlayers - spotsTaken);

    const players: OpenPlaySessionPlayer[] = entryRegs
      .filter((r) => r.player)
      .map((r) => ({
        name: r.player!.name,
        initials: initials(r.player!.name),
        avatarColor: avatarColor(r.player!.name),
        avatarPhotoPath: r.player!.avatarPhotoPath ?? null,
        facePhotoPath: r.player!.facePhotoPath ?? null,
        skillLevel: r.player!.skillLevel ?? null,
        checkInCount: r.player!.queueEntries.length,
      }));

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
      players,
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
  // Keep UTC midnight for the PG DATE column — new Date("YYYY-MM-DD") preserves it.
  // Build a separate local-midnight copy for setHours() slot arithmetic.
  const dateOnly = new Date(date);
  const localMidnight = new Date(date);
  localMidnight.setHours(0, 0, 0, 0);

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

  const startTime = new Date(localMidnight);
  startTime.setHours(entry.startHour, 0, 0, 0);
  const endTime = new Date(localMidnight);
  endTime.setHours(entry.endHour, 0, 0, 0);

  const dayOfWeek = localMidnight.getDay();
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
    // Check if player already has an active registration for this session
    const existing = await tx.openPlayRegistration.findUnique({
      where: { scheduleEntryId_date_playerId: { scheduleEntryId, date: dateOnly, playerId } },
    });

    if (existing) {
      const isActiveHold =
        existing.status === "confirmed" &&
        existing.paymentStatus === "pending" &&
        existing.holdExpiresAt &&
        existing.holdExpiresAt > new Date();

      const isPaid =
        existing.status === "confirmed" &&
        (existing.paymentStatus === "proof_submitted" || existing.paymentStatus === "paid");

      if (isActiveHold || isPaid) {
        throw Object.assign(
          new Error("You are already registered for this session"),
          { status: 409 }
        );
      }

      // Cancelled or expired hold — reuse the record
      const updated = await tx.openPlayRegistration.update({
        where: { id: existing.id },
        data: {
          status: "confirmed",
          paymentStatus: "pending",
          holdExpiresAt,
          paymentRef,
          priceValue,
          startTime,
          endTime,
          paymentProofUrl: null,
        },
      });
      return updated;
    }

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
