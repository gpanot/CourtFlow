import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";
import { emitToVenue } from "@/lib/socket-server";
import { assignPlayerFromQueueToCourt } from "@/lib/algorithm";

/**
 * TV Tablet queue join via face scan.
 * Public endpoint — no staff auth required.
 * Player scans face at the TV tablet to join the active queue.
 */
export async function POST(request: NextRequest) {
  try {
    const { venueId, imageBase64 } = await parseBody<{
      venueId: string;
      imageBase64: string;
    }>(request);

    if (!venueId?.trim()) return error("venueId is required", 400);
    if (!imageBase64?.trim()) return error("imageBase64 is required", 400);

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });
    if (!session) return error("No active session found", 404);

    const recognitionResult = await faceRecognitionService.recognizeFace(imageBase64);

    if (recognitionResult.resultType === "error") {
      return json({ success: false, resultType: "error", error: recognitionResult.error });
    }

    if (recognitionResult.resultType !== "matched" && recognitionResult.resultType !== "new_player") {
      return json({ success: true, resultType: "not_recognised" });
    }

    // Resolve player from face match
    let playerId: string | null = recognitionResult.playerId ?? null;

    if (!playerId && recognitionResult.faceSubjectId) {
      const playerByFace = await prisma.player.findFirst({
        where: { faceSubjectId: recognitionResult.faceSubjectId },
      });
      if (playerByFace) playerId = playerByFace.id;
    }

    if (!playerId) {
      return json({ success: true, resultType: "not_recognised" });
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true },
    });
    if (!player) {
      return json({ success: true, resultType: "not_recognised" });
    }

    return handleJoinQueue(session.id, venueId, player);
  } catch (e) {
    console.error("[TV Queue Join] Error:", e);
    return error((e as Error).message, 500);
  }
}

async function handleJoinQueue(
  sessionId: string,
  venueId: string,
  player: { id: string; name: string }
) {
  const entry = await prisma.queueEntry.findUnique({
    where: { sessionId_playerId: { sessionId, playerId: player.id } },
  });

  if (!entry) {
    return json({ success: true, resultType: "not_checked_in" });
  }

  if (entry.status === "waiting" || entry.status === "assigned") {
    const waitingEntries = await prisma.queueEntry.findMany({
      where: { sessionId, status: "waiting" },
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
      where: { sessionId, playerIds: { has: player.id }, endedAt: null },
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

  // Emit queue update
  const allEntries = await prisma.queueEntry.findMany({
    where: { sessionId, status: { in: ["waiting", "on_break"] } },
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

  // Calculate queue position
  const waitingOnly = allEntries.filter((e) => e.status === "waiting");
  const position = waitingOnly.findIndex((e) => e.playerId === player.id) + 1;

  // Auto-assign if a court is available
  const sessionRecord = await prisma.session.findUnique({ where: { id: sessionId } });
  if (sessionRecord && sessionRecord.warmupMode !== "manual") {
    try {
      await assignPlayerFromQueueToCourt(venueId, sessionId, player.id);
    } catch {
      // Non-fatal: player stays in queue
    }
  }

  return json({
    success: true,
    resultType: "joined",
    playerName: player.name,
    queueNumber: entry.queueNumber,
    queuePosition: position > 0 ? position : undefined,
  });
}
