import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getPortalVenueId } from "@/lib/venue-config";
import { getBookingConfig } from "@/lib/booking";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";
import { buildVietQRUrl } from "@/lib/vietqr";

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
    });
    if (!pkg) return error("Package not found", 404);

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { settings: true, bankName: true, bankAccount: true, bankOwnerName: true },
    });
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    const startTime = new Date(startTimeStr);
    const endTime = new Date(startTime);
    const slots = Math.max(1, Math.min(4, slotCount ?? 1));
    endTime.setMinutes(endTime.getMinutes() + pkg.durationMin * slots);
    const totalPrice = pkg.priceValue * slots;

    const conflict = await prisma.coachLesson.findFirst({
      where: {
        coachId,
        date,
        status: { in: ["confirmed", "completed"] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    });
    if (conflict) return error("Coach is not available at this time", 409);

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
          status: { in: ["confirmed", "completed"] },
          startTime: { lt: endTime },
          endTime: { gt: startTime },
        },
      });
      if (!courtConflict && !lessonConflict) {
        assignedCourtId = court.id;
        break;
      }
    }

    if (payWithCredit && creditId) {
      const result = await prisma.$executeRaw`
        UPDATE player_coach_credits
        SET used_sessions = used_sessions + 1, updated_at = NOW()
        WHERE id = ${creditId}
          AND used_sessions < total_sessions
          AND payment_status = 'paid'
          AND expires_at > NOW()
      `;
      if (result === 0) return error("No credits remaining or credit expired", 400);

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
          paymentStatus: "PAID",
          paidAt: new Date(),
          paymentMethod: "credit",
        },
      });

      return json({ lesson, paidWithCredit: true }, 201);
    }

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
        lesson,
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

    return json(lessons);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
