import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);

    const entry = await prisma.queueEntry.findFirst({
      where: {
        playerId: auth.id,
        status: { in: ["waiting", "assigned", "playing"] },
      },
      include: { session: true },
    });

    if (!entry) return error("No active queue entry found");

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "waiting", joinedAt: new Date() },
    });

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: entry.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(entry.session.venueId, "queue:updated", allEntries);
    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
