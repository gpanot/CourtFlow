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
      where: { playerId: auth.id, status: { in: ["waiting", "on_break"] } },
      include: { group: { include: { queueEntries: { where: { status: { in: ["waiting", "on_break", "playing"] } } } } } },
    });

    if (!entry) {
      console.log(`[Queue Leave] Player ${auth.id} not found in queue`);
      return error("Not in queue");
    }

    console.log(`[Queue Leave] Player ${auth.id} leaving queue (entry=${entry.id}, group=${entry.groupId})`);

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: "left", groupId: null },
    });

    if (entry.group) {
      const remainingMembers = entry.group.queueEntries.filter(
        (e) => e.id !== entry.id && e.status !== "left"
      );

      console.log(`[Queue Leave] Group ${entry.group.id} has ${remainingMembers.length} remaining members`);

      if (remainingMembers.length < 2) {
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

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: entry.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);
    return json({ success: true });
  } catch (e) {
    console.error("[Queue Leave] Error:", e);
    return error((e as Error).message, 500);
  }
}
