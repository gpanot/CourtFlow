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
      where: { playerId: auth.id, status: { in: ["waiting", "on_break"] }, groupId: { not: null } },
      include: {
        group: {
          include: {
            queueEntries: {
              where: { status: { in: ["waiting", "on_break", "playing"] } },
              include: { player: true },
            },
          },
        },
      },
    });

    if (!entry || !entry.group) return error("Not in a group");

    console.log(`[Group Leave] Player ${auth.id} leaving group ${entry.group.id} (code=${entry.group.code})`);

    // Remove player from group but keep them in queue
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { groupId: null },
    });

    const remainingMembers = entry.group.queueEntries.filter(
      (e) => e.id !== entry.id && e.status !== "left"
    );

    if (remainingMembers.length < 2) {
      // Dissolve the group
      await prisma.playerGroup.update({
        where: { id: entry.group.id },
        data: { status: "disbanded" },
      });
      await prisma.queueEntry.updateMany({
        where: { groupId: entry.group.id },
        data: { groupId: null },
      });

      console.log(`[Group Leave] Group ${entry.group.id} dissolved (only ${remainingMembers.length} remaining)`);
    }

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: entry.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);
    return json({ success: true });
  } catch (e) {
    console.error("[Group Leave] Error:", e);
    return error((e as Error).message, 500);
  }
}
