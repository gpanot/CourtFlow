import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { emitToVenue, emitToPlayer } from "@/lib/socket-server";
import { MAX_GROUP_SIZE } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const { code, venueId } = await parseBody<{ code: string; venueId: string }>(request);

    if (!code) return error("Group code is required");

    const entry = await prisma.queueEntry.findFirst({
      where: { playerId: auth.id, status: "waiting", groupId: null },
    });
    if (!entry) return error("Must be in queue (solo) to join a group");

    const group = await prisma.playerGroup.findFirst({
      where: {
        code: code.toUpperCase(),
        sessionId: entry.sessionId,
        status: { in: ["forming", "active"] },
      },
      include: {
        queueEntries: {
          where: { status: { not: "left" } },
          include: { player: true },
        },
      },
    });

    if (!group) return error("Invalid group code");
    if (group.queueEntries.length >= MAX_GROUP_SIZE) return error("This group is full");

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { groupId: group.id },
    });

    if (group.status === "forming" && group.queueEntries.length >= 1) {
      await prisma.playerGroup.update({
        where: { id: group.id },
        data: { status: "active" },
      });
    }

    const player = await prisma.player.findUnique({ where: { id: auth.id } });
    for (const member of group.queueEntries) {
      emitToPlayer(member.playerId, "player:notification", {
        type: "group_member_joined",
        message: `${player?.name} joined the group`,
      });
    }

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: entry.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);

    return json({ success: true, groupId: group.id });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
