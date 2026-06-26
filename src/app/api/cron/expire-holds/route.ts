import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/expire-holds
 *
 * Hard-deletes all bookings and open-play registrations whose payment hold
 * has expired (holdExpiresAt < now and paymentStatus still "pending").
 * Hard-deleting (not soft-cancelling) immediately frees the slot for re-booking.
 *
 * Also handles any lingering "cancelled" bookings that were soft-cancelled by
 * an old version of this route — they are cleaned up so the admin view stays tidy.
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
    // Hard-delete expired pending booking holds (frees the slot immediately)
    const deletedBookings = await prisma.booking.deleteMany({
      where: {
        paymentStatus: "pending",
        holdExpiresAt: { lt: now },
        status: "confirmed",
      },
    });

    // Hard-delete expired pending open-play registration holds
    const deletedOpenPlay = await prisma.openPlayRegistration.deleteMany({
      where: {
        paymentStatus: "pending",
        holdExpiresAt: { lt: now },
      },
    });

    // Clean up any stale "expired" status bookings left by the old soft-cancel approach
    const cleanedStale = await prisma.booking.deleteMany({
      where: {
        paymentStatus: "expired",
        status: "cancelled",
      },
    });

    return json({
      deletedBookings: deletedBookings.count,
      deletedOpenPlay: deletedOpenPlay.count,
      cleanedStale: cleanedStale.count,
      checkedAt: now.toISOString(),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
