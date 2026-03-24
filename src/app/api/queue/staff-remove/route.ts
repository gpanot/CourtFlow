import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue, emitToPlayer } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { playerId, venueId } = await parseBody<{ playerId: string; venueId: string }>(request);

    if (!playerId || !venueId) return error("playerId and venueId are required");

    const entry = await prisma.queueEntry.findFirst({
      where: { playerId, status: { in: ["waiting", "on_break"] } },
      include: {
        player: true,
        group: { include: { queueEntries: { where: { status: { in: ["waiting", "on_break", "playing"] } } } } },
      },
    });

    if (!entry) return error("Player not found in queue");

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "left", groupId: null },
    });

    // Handle group
    if (entry.group) {
      const remaining = entry.group.queueEntries.filter(
        (e) => e.id !== entry.id && e.status !== "left"
      );
      if (remaining.length < 2) {
        await prisma.playerGroup.update({
          where: { id: entry.group.id },
          data: { status: "disbanded" },
        });
        await prisma.queueEntry.updateMany({
          where: { groupId: entry.group.id },
          data: { groupId: null },
        });

      }
    }


    await prisma.auditLog.create({
      data: {
        venueId,
        staffId: auth.id,
        action: "player_removed_from_queue",
        targetId: playerId,
        reason: "staff_action",
      },
    });

    const session = await prisma.session.findFirst({ where: { venueId, status: "open" } });
    if (session) {
      const allEntries = await prisma.queueEntry.findMany({
        where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
        include: { player: true, group: true },
        orderBy: { joinedAt: "asc" },
      });
      emitToVenue(venueId, "queue:updated", allEntries);
    }

    return json({ success: true });
  } catch (e) {
    console.error("[Staff Remove] Error:", e);
    return error((e as Error).message, 500);
  }
}
