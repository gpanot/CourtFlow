import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

function generateGroupCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const { playerIds, venueId } = await parseBody<{
      playerIds: string[];
      venueId: string;
    }>(request);

    if (!playerIds || playerIds.length !== 4) {
      return error("Exactly 4 player IDs are required");
    }
    if (!venueId) return error("venueId is required");

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });
    if (!session) return error("No active session found");

    const entries = await prisma.queueEntry.findMany({
      where: {
        sessionId: session.id,
        playerId: { in: playerIds },
        status: "waiting",
        groupId: null,
      },
    });

    if (entries.length !== 4) {
      return error(
        `Only ${entries.length} of the 4 players are available (must be waiting and not already in a group)`
      );
    }

    let code: string;
    let attempts = 0;
    do {
      code = generateGroupCode();
      const existing = await prisma.playerGroup.findUnique({
        where: { sessionId_code: { sessionId: session.id, code } },
      });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const group = await prisma.playerGroup.create({
      data: {
        sessionId: session.id,
        code,
        status: "active",
      },
    });

    // Move all 4 entries to the group and re-stamp joinedAt so the group lands at the end of the queue
    const now = new Date();
    await prisma.queueEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { groupId: group.id, joinedAt: now },
    });

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: { include: { queueEntries: { include: { player: true } } } } },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);

    return json({ success: true, groupId: group.id, code }, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
