import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/expire-holds
 *
 * Cancels all bookings / coach lessons / credit purchases whose payment hold
 * has expired (holdExpiresAt < now and paymentStatus still "pending").
 *
 * Call via Railway cron or a server-side setInterval.
 * Protected by CRON_SECRET env var — pass as Bearer token or ?secret= query param.
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
  let cancelledBookings = 0;

  try {
    const expired = await prisma.booking.findMany({
      where: {
        paymentStatus: "pending",
        holdExpiresAt: { lt: now },
        status: "confirmed",
      },
      select: { id: true },
    });

    if (expired.length > 0) {
      const result = await prisma.booking.updateMany({
        where: { id: { in: expired.map((b) => b.id) } },
        data: {
          status: "cancelled",
          cancelledAt: now,
          paymentStatus: "expired",
        },
      });
      cancelledBookings = result.count;
    }

    return json({
      cancelledBookings,
      checkedAt: now.toISOString(),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
