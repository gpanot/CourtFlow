import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { emitToVenue } from "@/lib/socket-server";
import { assignPlayerFromQueueToCourt } from "@/lib/algorithm";

/**
 * TV Tablet queue join via wristband number fallback.
 * Public endpoint — no staff auth required.
 * Player enters their wristband number to join the queue when face scan fails.
 */
export async function POST(request: NextRequest) {
  try {
    const { venueId, queueNumber } = await parseBody<{
      venueId: string;
      queueNumber: number;
    }>(request);

    if (!venueId?.trim()) return error("venueId is required", 400);
    if (!queueNumber || queueNumber < 1) return error("Valid queueNumber is required", 400);

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });
    if (!session) return error("No active session found", 404);

    const entry = await prisma.queueEntry.findFirst({
      where: { sessionId: session.id, queueNumber },
      include: { player: { select: { id: true, name: true } } },
    });

    if (!entry) {
      return json({ success: true, resultType: "not_checked_in" });
    }

    const player = entry.player;

    if (entry.status === "waiting" || entry.status === "assigned") {
      const waitingEntries = await prisma.queueEntry.findMany({
        where: { sessionId: session.id, status: "waiting" },
        orderBy: { joinedAt: "asc" },
        select: { playerId: true },
      });
      const position = waitingEntries.findIndex((e) => e.playerId === player.id) + 1;
      return json({
        success: true,
        resultType: "already_queued",
        playerName: player.name,
        queueNumber: entry.queueNumber,
        queuePosition: position > 0 ? position : undefined,
      });
    }

    if (entry.status === "playing") {
      const assignment = await prisma.courtAssignment.findFirst({
        where: { sessionId: session.id, playerIds: { has: player.id }, endedAt: null },
        include: { court: { select: { label: true } } },
      });
      return json({
        success: true,
        resultType: "playing",
        playerName: player.name,
        courtLabel: assignment?.court.label ?? undefined,
      });
    }

    // Status is on_break (checked in) or left — join the queue
    await prisma.queueEntry.update({
      where: { id: entry.id },
      data: {
        status: "waiting",
        joinedAt: new Date(),
        breakUntil: null,
        groupId: null,
      },
    });

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
      include: {
        player: true,
        group: {
          include: {
            queueEntries: {
              where: { status: { not: "left" } },
              include: { player: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    emitToVenue(venueId, "queue:updated", allEntries);

    const waitingOnly = allEntries.filter((e) => e.status === "waiting");
    const position = waitingOnly.findIndex((e) => e.playerId === player.id) + 1;

    // Auto-assign if a court is available
    if (session.warmupMode !== "manual") {
      try {
        await assignPlayerFromQueueToCourt(venueId, session.id, player.id);
      } catch {
        // Non-fatal
      }
    }

    return json({
      success: true,
      resultType: "joined",
      playerName: player.name,
      queueNumber: entry.queueNumber,
      queuePosition: position > 0 ? position : undefined,
    });
  } catch (e) {
    console.error("[TV Queue Join by Number] Error:", e);
    return error((e as Error).message, 500);
  }
}
