import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/expire-holds
 *
 * Soft-expires all bookings, open-play registrations, and coach lessons whose
 * payment hold has timed out (holdExpiresAt < now and paymentStatus still "pending").
 *
 * Bookings: status → expired_hold, paymentStatus → expired, holdExpiresAt → null
 *   The partial unique index allows re-booking the same slot after expiry.
 *
 * Open-play: status → expired_hold, paymentStatus → expired, holdExpiresAt → null
 *   expiredAt is set so we know when the hold lapsed.
 *
 * Coach lessons: status → cancelled, paymentStatus → expired, cancelledAt → now
 *   (CoachLessonStatus has no expired_hold value — cancelled is the closest terminal)
 *
 * Should run every minute via Railway Cron:
 *   Schedule: * * * * *
 *   Command:  GET https://<your-domain>/api/cron/expire-holds
 *   Header:   Authorization: Bearer $CRON_SECRET
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization")?.replace("Bearer ", "");
    const query = request.nextUrl.searchParams.get("secret");
    if (auth !== secret && query !== secret) {
      return error("Unauthorized", 401);
    }
  }

  const now = new Date();

  try {
    // Soft-expire pending booking holds
    const expiredBookings = await prisma.booking.updateMany({
      where: {
        paymentStatus: "pending",
        holdExpiresAt: { lt: now },
        status: "confirmed",
      },
      data: {
        status: "expired_hold",
        paymentStatus: "expired",
        holdExpiresAt: null,
        cancelledAt: now,
      },
    });

    // Soft-expire pending open-play registration holds
    const expiredOpenPlay = await prisma.openPlayRegistration.updateMany({
      where: {
        paymentStatus: "pending",
        holdExpiresAt: { lt: now },
      },
      data: {
        status: "expired_hold",
        paymentStatus: "expired",
        holdExpiresAt: null,
        expiredAt: now,
      },
    });

    // Soft-expire pending coach lesson holds (derived hold: createdAt + 5 min).
    // coach_lessons.created_at is `timestamp without time zone` (stored in local/server tz),
    // so we use a raw SQL comparison with CURRENT_TIMESTAMP (also no tz) to avoid
    // timezone drift when Node.js passes a UTC Date to Prisma's typed query.
    const expiredLessonsResult = await prisma.$executeRaw`
      UPDATE coach_lessons
      SET status = 'cancelled',
          payment_status = 'expired',
          cancelled_at = NOW()
      WHERE payment_status = 'pending'
        AND status = 'confirmed'
        AND created_at < CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    `;
    const expiredLessons = { count: expiredLessonsResult };

    // Soft-expire pending booking_groups holds and cascade to their child bookings
    const expiredGroupsList = await prisma.bookingGroup.findMany({
      where: {
        paymentStatus: "pending",
        holdExpiresAt: { lt: now },
        status: "confirmed",
      },
      select: { id: true },
    });

    let expiredGroups = { count: 0 };
    let expiredGroupBookings = { count: 0 };
    if (expiredGroupsList.length > 0) {
      const expiredGroupIds = expiredGroupsList.map((g) => g.id);
      [expiredGroups, expiredGroupBookings] = await prisma.$transaction([
        prisma.bookingGroup.updateMany({
          where: { id: { in: expiredGroupIds } },
          data: {
            status: "expired_hold",
            paymentStatus: "expired",
            holdExpiresAt: null,
            cancelledAt: now,
          },
        }),
        prisma.booking.updateMany({
          where: { bookingGroupId: { in: expiredGroupIds } },
          data: {
            status: "expired_hold",
            paymentStatus: "expired",
            holdExpiresAt: null,
            cancelledAt: now,
          },
        }),
      ]);
    }

    // Clean up any stale "expired" paymentStatus bookings left by the old hard-delete
    // approach that somehow survived (defensive cleanup).
    const cleanedStale = await prisma.booking.deleteMany({
      where: {
        paymentStatus: "expired",
        status: "cancelled",
      },
    });

    return json({
      expiredBookings: expiredBookings.count,
      expiredOpenPlay: expiredOpenPlay.count,
      expiredLessons: expiredLessons.count,
      expiredGroups: expiredGroups.count,
      expiredGroupBookings: expiredGroupBookings.count,
      cleanedStale: cleanedStale.count,
      checkedAt: now.toISOString(),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
