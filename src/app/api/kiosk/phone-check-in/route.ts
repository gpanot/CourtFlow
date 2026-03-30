import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";
import { emitToVenue } from "@/lib/socket-server";
import { findPlayerByPhoneDigits } from "@/lib/find-player-by-phone-digits";

async function buildAlreadyCheckedInResponse(
  sessionId: string,
  playerId: string,
  displayName: string | undefined
) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { skillLevel: true, name: true },
  });
  const sessionEntry = await prisma.queueEntry.findUnique({
    where: {
      sessionId_playerId: { sessionId, playerId },
    },
    select: { queueNumber: true, status: true },
  });
  let queuePosition: number | undefined;
  if (sessionEntry?.status === "waiting") {
    const waitingEntries = await prisma.queueEntry.findMany({
      where: { sessionId, status: "waiting" },
      orderBy: { joinedAt: "asc" },
    });
    const pos = waitingEntries.findIndex((e) => e.playerId === playerId) + 1;
    queuePosition = pos > 0 ? pos : undefined;
  }
  const totalSessions = await prisma.queueEntry.count({
    where: { playerId, status: "left" },
  });
  const queueNumber =
    sessionEntry?.queueNumber != null && sessionEntry.queueNumber > 0
      ? sessionEntry.queueNumber
      : undefined;
  return json({
    success: true,
    resultType: "already_checked_in",
    playerId,
    displayName: displayName ?? player?.name ?? undefined,
    alreadyCheckedIn: true,
    queueNumber,
    queuePosition,
    skillLevel: player?.skillLevel,
    totalSessions,
    isReturning: true,
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{
      venueId: string;
      phase: "lookup" | "confirm";
      phone?: string;
      playerId?: string;
    }>(request);

    const { venueId, phase } = body;
    if (!venueId?.trim()) {
      return error("venueId is required", 400);
    }

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });

    if (!session) {
      return error("No active session found", 404);
    }

    if (phase === "lookup") {
      const phone = typeof body.phone === "string" ? body.phone.trim() : "";
      if (!phone) {
        return error("phone is required", 400);
      }

      const row = await findPlayerByPhoneDigits(phone);
      if (!row) {
        return error("No player found with this phone number", 404);
      }

      const recentlyCheckedIn = await faceRecognitionService.isRecentlyCheckedIn(
        row.id,
        session.id
      );

      const sessionEntry = await prisma.queueEntry.findUnique({
        where: {
          sessionId_playerId: { sessionId: session.id, playerId: row.id },
        },
        select: { queueNumber: true },
      });

      const waitingEntries = await prisma.queueEntry.findMany({
        where: { sessionId: session.id, status: "waiting" },
        orderBy: { joinedAt: "asc" },
      });
      const queuePositionRaw = waitingEntries.findIndex((e) => e.playerId === row.id) + 1;
      const totalSessions = await prisma.queueEntry.count({
        where: { playerId: row.id, status: "left" },
      });
      const queueNumber =
        sessionEntry?.queueNumber != null && sessionEntry.queueNumber > 0
          ? sessionEntry.queueNumber
          : undefined;

      return json({
        success: true,
        player: {
          id: row.id,
          name: row.name,
          phone: row.phone,
          skillLevel: row.skillLevel,
          gender: row.gender,
        },
        alreadyCheckedIn: recentlyCheckedIn,
        queueNumber,
        queuePosition: queuePositionRaw > 0 ? queuePositionRaw : undefined,
        totalSessions,
      });
    }

    if (phase === "confirm") {
      const playerId = typeof body.playerId === "string" ? body.playerId.trim() : "";
      if (!playerId) {
        return error("playerId is required", 400);
      }

      const player = await prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true, name: true, phone: true, skillLevel: true },
      });

      if (!player) {
        return error("Player not found", 404);
      }

      const faceAttempt = await prisma.faceAttempt.create({
        data: {
          eventId: session.id,
          resultType: "processing",
          phoneNumber: player.phone,
        },
      });

      try {
        const recentlyCheckedIn = await faceRecognitionService.isRecentlyCheckedIn(
          player.id,
          session.id
        );

        if (recentlyCheckedIn) {
          await prisma.faceAttempt.update({
            where: { id: faceAttempt.id },
            data: {
              resultType: "already_checked_in",
              matchedPlayerId: player.id,
              phoneNumber: player.phone,
            },
          });

          return buildAlreadyCheckedInResponse(
            session.id,
            player.id,
            player.name
          );
        }

        const existingEntry = await prisma.queueEntry.findUnique({
          where: {
            sessionId_playerId: {
              sessionId: session.id,
              playerId: player.id,
            },
          },
        });

        const queueNumber =
          existingEntry?.queueNumber != null
            ? existingEntry.queueNumber
            : await faceRecognitionService.getNextQueueNumber(session.id);

        let queueEntry;
        if (existingEntry) {
          // Re-activate as checked-in (on_break = checked in, not in queue)
          queueEntry = await prisma.queueEntry.update({
            where: { id: existingEntry.id },
            data: {
              status: "on_break",
              queueNumber,
            },
            include: { player: true },
          });
        } else {
          // Create as checked-in (on_break = checked in, not in queue)
          queueEntry = await prisma.queueEntry.create({
            data: {
              sessionId: session.id,
              playerId: player.id,
              status: "on_break",
              queueNumber,
            },
            include: { player: true },
          });
        }

        await prisma.faceAttempt.update({
          where: { id: faceAttempt.id },
          data: {
            resultType: "phone_check_in",
            matchedPlayerId: player.id,
            queueNumberAssigned: queueNumber,
            phoneNumber: player.phone,
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

        await prisma.auditLog.create({
          data: {
            venueId,
            staffId: auth.id,
            action: "face_check_in_player",
            targetId: player.id,
            metadata: {
              queueEntryId: queueEntry.id,
              sessionId: session.id,
              method: "phone_number",
              phoneNumber: player.phone,
              playerFound: true,
            },
          },
        });

        const totalSessions = await prisma.queueEntry.count({
          where: { playerId: player.id, status: "left" },
        });

        return json({
          success: true,
          resultType: "checked_in",
          playerId: player.id,
          displayName: player.name,
          queueNumber,
          skillLevel: queueEntry.player.skillLevel,
          totalSessions,
          isReturning: true,
          alreadyCheckedIn: false,
        });
      } catch (e) {
        await prisma.faceAttempt.update({
          where: { id: faceAttempt.id },
          data: { resultType: "error", phoneNumber: player.phone },
        });
        throw e;
      }
    }

    return error("Invalid phase", 400);
  } catch (e) {
    console.error("[Kiosk Phone Check-in] Error:", e);
    return error((e as Error).message, 500);
  }
}
