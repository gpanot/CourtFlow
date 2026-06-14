import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const venueIds = await getAuthorizedVenueIds(auth);

    const since = new Date();
    since.setDate(since.getDate() - 14);

    const bookings = await prisma.booking.findMany({
      where: {
        venueId: { in: venueIds },
        status: { in: ["confirmed", "completed"] },
        paymentStatus: { in: ["paid", "proof_submitted"] },
        createdAt: { gte: since },
      },
      select: {
        id: true,
        venueId: true,
        date: true,
        startTime: true,
        paymentStatus: true,
        player: { select: { name: true } },
        court: { select: { label: true } },
        venue: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return json(
      bookings.map((b) => ({
        id: b.id,
        venueId: b.venueId,
        date: b.date,
        startTime: b.startTime,
        paymentStatus: b.paymentStatus,
        playerName: b.player.name,
        courtLabel: b.court.label,
        venueName: b.venue.name,
      }))
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("authorization") || msg.includes("token") || msg.includes("access required")) {
      return error(msg, 401);
    }
    return error(msg, 500);
  }
}
