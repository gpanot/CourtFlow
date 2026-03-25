import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

/** Staff: return an on_break player to waiting (end of queue). */
export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { playerId, venueId } = await parseBody<{ playerId: string; venueId: string }>(request);

    if (!playerId || !venueId) return error("playerId and venueId are required");

    const entry = await prisma.queueEntry.findFirst({
      where: { playerId, status: "on_break" },
      include: { player: true },
    });

    if (!entry) return error("Player is not on break");

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: {
        status: "waiting",
        breakUntil: null,
        joinedAt: new Date(),
        groupId: null,
      },
    });

    await prisma.auditLog.create({
      data: {
        venueId,
        staffId: auth.id,
        action: "player_staff_back_to_queue",
        targetId: playerId,
        reason: "staff_action",
      },
    });

    const session = await prisma.session.findFirst({ where: { venueId, status: "open" } });
    if (session) {
      const allEntries = await prisma.queueEntry.findMany({
        where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
        include: {
          player: true,
          group: { include: { queueEntries: { where: { status: { not: "left" } }, include: { player: true } } } },
        },
        orderBy: { joinedAt: "asc" },
      });
      emitToVenue(venueId, "queue:updated", allEntries);
    }

    return json({ success: true });
  } catch (e) {
    console.error("[Staff Back to Queue] Error:", e);
    return error((e as Error).message, 500);
  }
}
