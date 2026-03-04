import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const { venueId } = await parseBody<{ venueId: string }>(request);

    const entry = await prisma.queueEntry.findFirst({
      where: { playerId: auth.id, status: "on_break" },
    });
    if (!entry) return error("Not on break");

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "waiting", breakUntil: null },
    });

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: entry.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);
    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
