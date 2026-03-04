import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
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
    const auth = requireAuth(request.headers);

    const entry = await prisma.queueEntry.findFirst({
      where: { playerId: auth.id, status: "waiting", groupId: null },
      include: { session: true },
    });
    if (!entry) return error("Must be in queue (solo) to create a group");

    let code: string;
    let attempts = 0;
    do {
      code = generateGroupCode();
      const existing = await prisma.playerGroup.findUnique({
        where: { sessionId_code: { sessionId: entry.sessionId, code } },
      });
      if (!existing) break;
      attempts++;
    } while (attempts < 10);

    const group = await prisma.playerGroup.create({
      data: {
        sessionId: entry.sessionId,
        code,
        status: "forming",
      },
    });

    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { groupId: group.id },
    });

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: entry.sessionId, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(entry.session.venueId, "queue:updated", allEntries);

    return json({ group, code }, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
