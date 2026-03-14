import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const { groupId, venueId } = await parseBody<{
      groupId: string;
      venueId: string;
    }>(request);

    if (!groupId) return error("groupId is required");
    if (!venueId) return error("venueId is required");

    const group = await prisma.playerGroup.findUnique({
      where: { id: groupId },
      include: { session: true },
    });
    if (!group) return error("Group not found", 404);

    // Unlink all queue entries from this group
    await prisma.queueEntry.updateMany({
      where: { groupId },
      data: { groupId: null },
    });

    // Mark the group as dissolved
    await prisma.playerGroup.update({
      where: { id: groupId },
      data: { status: "disbanded" },
    });

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: group.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: { include: { queueEntries: { include: { player: true } } } } },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
