import { NextRequest } from "next/server";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { sendPushToPlayer } from "@/lib/push";
import { json, error } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const body = (await request.json()) as { venueId?: string };
    const venueId = body.venueId;
    if (!venueId) return error("venueId is required");

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
      orderBy: { openedAt: "desc" },
    });

    if (!session) return error("No open session found", 404);

    const entries = await prisma.queueEntry.findMany({
      where: {
        sessionId: session.id,
        status: { in: ["waiting", "assigned", "playing", "on_break"] },
      },
      select: { playerId: true },
    });

    const playerIds = [...new Set(entries.map((e) => e.playerId))];

    const results = await Promise.allSettled(
      playerIds.map((pid) =>
        sendPushToPlayer(pid, {
          title: "🏓 Test Notification",
          body: "This is a test push from CourtFlow staff. If you see this, notifications work!",
          tag: "test",
        })
      )
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;

    return json({ sent, total: playerIds.length });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
