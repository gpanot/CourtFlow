import { prisma } from "./db";
import type { CoachPackage } from "@prisma/client";
import { getBookingConfig } from "./booking";
import { generatePaymentRef } from "../modules/courtpay/lib/payment-reference";
import { buildVietQRUrl } from "./vietqr";
import { isCoachAvailable, findNextAvailableSlot } from "./coach-availability";
import { buildLessonEmailContext, sendLessonEventEmails } from "./email/send";
import { toDateKey, parseDateKey } from "./date";

const HOLD_MINUTES = 5;

export type DefaultPackage = Pick<
  CoachPackage,
  "id" | "name" | "lessonType" | "durationMin" | "priceValue" | "sessionsIncluded"
>;

/**
 * Returns the "default" single-session package for a coach at a venue.
 *
 * Selection order (first match wins):
 *   1. Active private package with sessionsIncluded = 1, lowest sortOrder
 *   2. Any active private package, lowest sortOrder
 *   3. Any active package, lowest sortOrder
 *   4. null — no active packages exist
 *
 * This lets the booking agent proceed without the player ever knowing package IDs.
 * When a player says "book a one-time lesson" the agent calls this, gets the
 * packageId, then passes it to create_coach_lesson.
 */
export async function getDefaultPackageForCoach(
  coachId: string,
  venueId: string
): Promise<DefaultPackage | null> {
  const packages = await prisma.coachPackage.findMany({
    where: { coachId, venueId, active: true },
    select: {
      id: true,
      name: true,
      lessonType: true,
      durationMin: true,
      priceValue: true,
      sessionsIncluded: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
  });

  if (packages.length === 0) return null;

  // Prefer: private + single-session
  const singlePrivate = packages.find(
    (p) => p.lessonType === "private" && p.sessionsIncluded === 1
  );
  if (singlePrivate) return singlePrivate;

  // Fallback: any private
  const anyPrivate = packages.find((p) => p.lessonType === "private");
  if (anyPrivate) return anyPrivate;

  // Last resort: first active package
  return packages[0];
}

export interface CreateCoachLessonInput {
  coachId: string;
  packageId: string;
  /** "YYYY-MM-DD" — parsed as UTC midnight so PG DATE stores the correct local day */
  date: string;
  /** ISO datetime string for the slot start */
  startTime: string;
  /** Number of consecutive package-duration slots (1–4, default 1) */
  slotCount?: number;
  /** If true, deduct one credit from creditId instead of generating a VietQR payment */
  payWithCredit?: boolean;
  /** Required when payWithCredit=true */
  creditId?: string;
  venueId: string;
}

export type CreateCoachLessonResult =
  | {
      lesson: Record<string, unknown>;
      paidWithCredit: true;
    }
  | {
      lesson: Record<string, unknown>;
      payment: {
        paymentRef: string;
        holdExpiresAt: string;
        qrUrl: string | null;
        amount: number;
        bankName: string | null;
        bankAccount: string | null;
        bankOwnerName: string | null;
      };
    };

/**
 * Errors that map to specific HTTP status codes so the route handler can
 * surface them correctly without inspecting raw error messages.
 */
export class CoachLessonError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 404 | 409 = 400,
    public readonly extra?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CoachLessonError";
  }
}

/**
 * Creates a coach lesson booking for a given player.
 *
 * Two paths:
 *  1. Credit path (payWithCredit=true, creditId provided):
 *     - Atomically deducts one session from PlayerCoachCredit
 *     - Creates CoachLesson (status=confirmed, paymentStatus=paid)
 *     - Creates CreditTransaction audit row
 *     - Fires auto_confirmed emails (non-blocking)
 *
 *  2. VietQR path (default):
 *     - Creates CoachLesson (status=pending_approval, paymentStatus=pending)
 *     - Generates CF-CL-XXXXXX payment reference for SePay matching
 *     - Returns VietQR image URL and bank details for display
 *     - No emails at creation time (emails fire on staff approval or Sepay webhook)
 *
 * Throws CoachLessonError for business-rule failures (package not found, coach
 * unavailable, no credits remaining). Throws raw errors for unexpected DB failures.
 *
 * No Next.js or HTTP coupling — accepts playerId and venueId as plain parameters.
 */
export async function createCoachLesson(
  playerId: string,
  input: CreateCoachLessonInput
): Promise<CreateCoachLessonResult> {
  const {
    coachId,
    packageId,
    date: dateStr,
    startTime: startTimeStr,
    slotCount,
    payWithCredit,
    creditId,
    venueId,
  } = input;

  const pkg = await prisma.coachPackage.findFirst({
    where: { id: packageId, coachId, venueId, active: true },
    include: { coach: { select: { creditPackageValidityDays: true } } },
  });
  if (!pkg) throw new CoachLessonError("Package not found", 404);

  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
    select: { settings: true, bankName: true, bankAccount: true, bankOwnerName: true },
  });
  const config = getBookingConfig(venue.settings as Record<string, unknown>);

  const dateKey = dateStr.split("T")[0]; // bare YYYY-MM-DD
  // parseDateKey → local midnight (2026-06-26T00:00:00+07:00 = 2026-06-25T17:00:00Z).
  // Used for availability WHERE queries (getDay/getHours local methods — correct).
  const date = parseDateKey(dateKey);
  // For Prisma DATE column writes: Prisma requires a Date object but serialises it
  // via .toISOString() → UTC. To prevent the 7-h shift, we build a Date that sits
  // at noon local time so its UTC representation still falls on the same calendar day
  // regardless of timezone offset (noon UTC+7 = 05:00 UTC → date stays 2026-06-26).
  const dateForWrite = new Date(dateKey + "T12:00:00+07:00");
  const startTime = new Date(startTimeStr);
  const endTime = new Date(startTime);
  const slots = Math.max(1, Math.min(4, slotCount ?? 1));
  endTime.setMinutes(endTime.getMinutes() + pkg.durationMin * slots);
  const totalPrice = pkg.priceValue * slots;

  // Three-layer availability check (Google Calendar is layer 4, inside isCoachAvailable)
  const avail = await isCoachAvailable(coachId, date, startTime, endTime);
  if (!avail.available) {
    const next = await findNextAvailableSlot(
      coachId,
      date,
      pkg.durationMin,
      config.bookingStartHour,
      config.bookingEndHour
    );
    throw new CoachLessonError(
      "Coach is not available at this time",
      409,
      {
        reason: avail.reason,
        nextAvailableSlot: next
          ? {
              date: toDateKey(next.date),
              startTime: next.startTime.toISOString(),
              endTime: next.endTime.toISOString(),
            }
          : null,
      }
    );
  }

  const courts = await prisma.court.findMany({
    where: { venueId, isBookable: true },
    select: { id: true },
  });

  let assignedCourtId: string | null = null;
  for (const court of courts) {
    const courtConflict = await prisma.booking.findFirst({
      where: {
        courtId: court.id,
        date,
        status: { not: "cancelled" },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        OR: [
          { holdExpiresAt: null },
          { holdExpiresAt: { gt: new Date() } },
          { paymentStatus: { not: "pending" } },
        ],
      },
    });
    const lessonConflict = await prisma.coachLesson.findFirst({
      where: {
        courtId: court.id,
        date,
        status: { in: ["confirmed", "completed", "pending_approval"] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (!courtConflict && !lessonConflict) {
      assignedCourtId = court.id;
      break;
    }
  }

  // Credit payment path — deduct 1 credit atomically, create audit row
  if (payWithCredit && creditId) {
    const [updated, lesson] = await prisma.$transaction(async (tx) => {
      const credit = await tx.playerCoachCredit.findFirst({
        where: {
          id: creditId,
          playerId,
          coachId,
          paymentStatus: "paid",
          expiresAt: { gt: new Date() },
        },
        select: { id: true, usedSessions: true, totalSessions: true },
      });
      if (!credit || credit.usedSessions >= credit.totalSessions) {
        throw new Error("No credits remaining or credit expired");
      }

      const updatedCredit = await tx.playerCoachCredit.update({
        where: { id: creditId },
        data: { usedSessions: { increment: 1 } },
      });

      const newLesson = await tx.coachLesson.create({
        data: {
          venueId,
          coachId,
          playerId,
          courtId: assignedCourtId,
          packageId,
          date: dateForWrite,
          startTime,
          endTime,
          priceValue: totalPrice,
          paymentStatus: "paid",
          paidAt: new Date(),
          paymentMethod: "credit",
          status: "confirmed",
        },
      });

      await tx.creditTransaction.create({
        data: {
          creditId,
          lessonId: newLesson.id,
          amount: -1,
          reason: "booked",
        },
      });

      return [updatedCredit, newLesson];
    });

    void updated; // used inside transaction

    const ctx = await buildLessonEmailContext(lesson.id);
    if (ctx) void sendLessonEventEmails(ctx, "auto_confirmed");

    return { lesson: { ...lesson, date: toDateKey(lesson.date) }, paidWithCredit: true };
  }

  // VietQR / manual QR path — lesson starts as pending_approval
  const paymentRef = await generatePaymentRef("coach-lesson");
  const lesson = await prisma.coachLesson.create({
    data: {
      venueId,
      coachId,
      playerId,
      courtId: assignedCourtId,
      packageId,
      date: dateForWrite,
      startTime,
      endTime,
      priceValue: totalPrice,
      paymentStatus: "pending",
      paymentRef,
      status: "pending_approval",
    },
  });

  const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

  const qrUrl = buildVietQRUrl({
    bankBin: venue.bankName || "",
    accountNumber: venue.bankAccount || "",
    accountName: venue.bankOwnerName || "",
    amount: totalPrice,
    description: paymentRef,
  });

  return {
    lesson: { ...lesson, date: toDateKey(lesson.date) },
    payment: {
      paymentRef,
      holdExpiresAt: holdExpiresAt.toISOString(),
      qrUrl,
      amount: totalPrice,
      bankName: venue.bankName,
      bankAccount: venue.bankAccount,
      bankOwnerName: venue.bankOwnerName,
    },
  };
}
