import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");

    const now = new Date();

    const where = {
      playerId: auth.id,
      ...(venueId && { venueId }),
    };

    const [upcoming, past] = await Promise.all([
      prisma.booking.findMany({
        where: { ...where, startTime: { gte: now }, status: "confirmed" },
        include: {
          court: { select: { id: true, label: true } },
          venue: { select: { id: true, name: true } },
        },
        orderBy: { startTime: "asc" },
      }),
      prisma.booking.findMany({
        where: {
          ...where,
          OR: [
            { startTime: { lt: now } },
            { status: { in: ["completed", "cancelled", "no_show"] } },
          ],
        },
        include: {
          court: { select: { id: true, label: true } },
          venue: { select: { id: true, name: true } },
        },
        orderBy: { startTime: "desc" },
        take: 20,
      }),
    ]);

    return json({ upcoming, past });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
