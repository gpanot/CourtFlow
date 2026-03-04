import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const { venueId, minutes } = await parseBody<{ venueId: string; minutes: number }>(request);

    if (!minutes || minutes < 5 || minutes > 30) {
      return error("Break must be between 5 and 30 minutes");
    }

    const entry = await prisma.queueEntry.findFirst({
      where: { playerId: auth.id, status: "waiting" },
    });
    if (!entry) return error("Not in queue");

    const breakUntil = new Date(Date.now() + minutes * 60 * 1000);

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "on_break", breakUntil },
    });

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: entry.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);
    return json({ breakUntil });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
