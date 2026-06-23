import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getPortalVenueId } from "@/lib/venue-config";
import { getBookingConfig } from "@/lib/booking";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";
import { buildVietQRUrl } from "@/lib/vietqr";
import { isCoachAvailable, findNextAvailableSlot } from "@/lib/coach-availability";
import { buildLessonEmailContext, sendLessonEventEmails } from "@/lib/email/send";
import { toDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

const HOLD_MINUTES = 5;

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json();
    const {
      coachId,
      packageId,
      date: dateStr,
      startTime: startTimeStr,
      slotCount,
      payWithCredit,
      creditId,
      venueId: bodyVenueId,
    } = body as {
      coachId: string;
      packageId: string;
      date: string;
      startTime: string;
      slotCount?: number;
      payWithCredit?: boolean;
      creditId?: string;
      venueId?: string;
    };
    const venueId = bodyVenueId || getPortalVenueId();

    const pkg = await prisma.coachPackage.findFirst({
      where: { id: packageId, coachId, venueId, active: true },
      include: { coach: { select: { creditPackageValidityDays: true } } },
    });
    if (!pkg) return error("Package not found", 404);

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { settings: true, bankName: true, bankAccount: true, bankOwnerName: true },
    });
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    // new Date("YYYY-MM-DD") → UTC midnight. PG DATE stores the correct day from this.
    const date = new Date(dateStr);
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
      return json(
        {
          error: "Coach is not available at this time",
          reason: avail.reason,
          nextAvailableSlot: next
            ? {
                date: toDateKey(next.date),
                startTime: next.startTime.toISOString(),
                endTime: next.endTime.toISOString(),
              }
            : null,
        },
        409
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
            date,
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

      return json({ lesson: { ...lesson, date: toDateKey(lesson.date) }, paidWithCredit: true }, 201);
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
        date,
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

    return json(
      {
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
      },
      201
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    if (msg === "No credits remaining or credit expired") return error(msg, 400);
    return error(msg, 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);

    const lessons = await prisma.coachLesson.findMany({
      where: { playerId },
      include: {
        coach: { select: { name: true, coachPhoto: true } },
        package: { select: { name: true } },
        court: { select: { label: true } },
      },
      orderBy: { startTime: "desc" },
    });

    return json(lessons.map((l) => ({ ...l, date: toDateKey(l.date) })));
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
