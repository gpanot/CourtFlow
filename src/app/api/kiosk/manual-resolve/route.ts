import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";
import { emitToVenue } from "@/lib/socket-server";
import { initialRankingScoreForSkillLevel } from "@/lib/ranking";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{
      venueId: string;
      attemptId: string;
      action: "select_player" | "create_new";
      selectedPlayerId?: string;
    }>(request);

    const { venueId, attemptId, action, selectedPlayerId } = body;

    if (!venueId?.trim()) {
      return error("venueId is required", 400);
    }

    if (!attemptId?.trim()) {
      return error("attemptId is required", 400);
    }

    if (action !== "select_player" && action !== "create_new") {
      return error("action must be 'select_player' or 'create_new'", 400);
    }

    if (action === "select_player" && !selectedPlayerId?.trim()) {
      return error("selectedPlayerId is required when action is 'select_player'", 400);
    }

    // Get active session
    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });

    if (!session) {
      return error("No active session found", 404);
    }

    // Get face attempt
    const faceAttempt = await prisma.faceAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!faceAttempt) {
      return error("Face attempt not found", 404);
    }

    if (faceAttempt.eventId !== session.id) {
      return error("Face attempt does not belong to current session", 400);
    }

    let result;

    if (action === "select_player") {
      const existingEntry = await prisma.queueEntry.findUnique({
        where: {
          sessionId_playerId: {
            sessionId: session.id,
            playerId: selectedPlayerId!,
          },
        },
      });

      if (
        existingEntry &&
        ["waiting", "assigned", "playing", "on_break"].includes(existingEntry.status)
      ) {
        return json({
          success: false,
          error: "Player is already active in this session queue",
        });
      }

      const queueNumber =
        existingEntry?.queueNumber != null
          ? existingEntry.queueNumber
          : await faceRecognitionService.getNextQueueNumber(session.id);

      // Check in as on_break (= checked in, not in queue)
      const queueEntry =
        existingEntry != null
          ? await prisma.queueEntry.update({
              where: { id: existingEntry.id },
              data: {
                status: "on_break",
                queueNumber,
                groupId: null,
                breakUntil: null,
              },
              include: { player: true },
            })
          : await prisma.queueEntry.create({
              data: {
                sessionId: session.id,
                playerId: selectedPlayerId!,
                status: "on_break",
                queueNumber,
              },
              include: { player: true },
            });

      // Update face attempt
      await prisma.faceAttempt.update({
        where: { id: attemptId },
        data: {
          resultType: "matched",
          matchedPlayerId: selectedPlayerId,
          hostReviewed: true,
          queueNumberAssigned: queueNumber,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          venueId,
          staffId: auth.id,
          action: "face_manual_resolve_player",
          targetId: selectedPlayerId,
          metadata: { 
            queueEntryId: queueEntry.id, 
            sessionId: session.id,
            attemptId,
          },
        },
      });

      result = {
        success: true,
        resultType: "matched",
        playerId: selectedPlayerId,
        displayName: queueEntry.player.name,
        queueNumber,
      };
    } else {
      // Create new player
      const newPlayer = await prisma.player.create({
        data: {
          name: `Player ${Date.now()}`,
          phone: `manual_face_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          gender: "other",
          skillLevel: "beginner",
          avatar: "🏓",
          rankingScore: initialRankingScoreForSkillLevel("beginner"),
        },
      });

      // Get next queue number and add to queue
      const queueNumber = await faceRecognitionService.getNextQueueNumber(session.id);

      const queueEntry = await prisma.queueEntry.create({
        data: {
          sessionId: session.id,
          playerId: newPlayer.id,
          status: "on_break",
          queueNumber,
        },
        include: { player: true },
      });

      // Update face attempt
      await prisma.faceAttempt.update({
        where: { id: attemptId },
        data: {
          resultType: "new_player",
          matchedPlayerId: newPlayer.id,
          createdNewPlayer: true,
          hostReviewed: true,
          queueNumberAssigned: queueNumber,
        },
      });

      // Create audit log
      await prisma.auditLog.create({
        data: {
          venueId,
          staffId: auth.id,
          action: "face_manual_resolve_new_player",
          targetId: newPlayer.id,
          metadata: { 
            queueEntryId: queueEntry.id, 
            sessionId: session.id,
            attemptId,
          },
        },
      });

      result = {
        success: true,
        resultType: "new_player",
        playerId: newPlayer.id,
        displayName: newPlayer.name,
        queueNumber,
      };
    }

    // Emit real-time queue update
    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
      include: {
        player: true,
        group: { include: { queueEntries: { where: { status: { not: "left" } }, include: { player: true } } } },
      },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(venueId, "queue:updated", allEntries);

    return json(result);
  } catch (e) {
    console.error("[Kiosk Manual Resolve] Error:", e);
    return error((e as Error).message, 500);
  }
}
