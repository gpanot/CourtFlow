import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  faceRecognitionService,
  type FaceRecognitionDebugInfo,
} from "@/lib/face-recognition";
import { emitToVenue } from "@/lib/socket-server";

const QUEUE_WAITING_STATUSES = ["waiting", "on_break"] as const;

async function buildAlreadyCheckedInResponse(
  sessionId: string,
  playerId: string,
  displayName: string | undefined,
  faceDbg: Record<string, unknown>
) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { skillLevel: true, name: true },
  });
  const sessionEntry = await prisma.queueEntry.findUnique({
    where: {
      sessionId_playerId: { sessionId, playerId },
    },
    select: { queueNumber: true },
  });
  const allEntries = await prisma.queueEntry.findMany({
    where: { sessionId, status: { in: [...QUEUE_WAITING_STATUSES] } },
    orderBy: { joinedAt: "asc" },
  });
  const queuePositionRaw = allEntries.findIndex((e) => e.playerId === playerId) + 1;
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
    queuePosition: queuePositionRaw > 0 ? queuePositionRaw : undefined,
    skillLevel: player?.skillLevel,
    totalSessions,
    isReturning: true,
    ...faceDbg,
  });
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{
      venueId: string;
      imageBase64: string;
      kioskId?: string;
      /** When true, response includes faceDebug (AWS SearchFaces summary) for staff kiosk UI */
      debug?: boolean;
    }>(request);

    const { venueId, imageBase64, kioskId, debug: wantsDebug } = body;

    if (!venueId?.trim()) {
      return error("venueId is required", 400);
    }

    if (!imageBase64?.trim()) {
      return error("imageBase64 is required", 400);
    }

    // Get active session
    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });

    if (!session) {
      return error("No active session found", 404);
    }

    // Log face attempt
    const faceAttempt = await prisma.faceAttempt.create({
      data: {
        eventId: session.id,
        kioskDeviceId: kioskId,
        resultType: "processing",
      },
    });

    let result;
    let faceDebugForResponse: FaceRecognitionDebugInfo | undefined;

    try {
      console.log("[Kiosk] Processing face for session:", session.id);
      console.log("[Kiosk] imageBase64 length:", imageBase64?.length);
      console.log("[Kiosk] debug payload:", wantsDebug === true);

      // Recognize face
      const recognitionResult = await faceRecognitionService.recognizeFace(
        imageBase64,
        { debug: wantsDebug === true }
      );

      if (wantsDebug === true && recognitionResult.recognitionDebug) {
        faceDebugForResponse = recognitionResult.recognitionDebug;
      }

      const faceDbg = faceDebugForResponse
        ? { faceDebug: faceDebugForResponse }
        : {};

      if (recognitionResult.recognitionDebug) {
        console.log("[Kiosk] Rekognition debug:", recognitionResult.recognitionDebug);
      }

      if (recognitionResult.resultType === "error") {
        await prisma.faceAttempt.update({
          where: { id: faceAttempt.id },
          data: { resultType: "error" },
        });

        return json({
          success: false,
          resultType: "error",
          error: recognitionResult.error,
          ...faceDbg,
        });
      }

      if (recognitionResult.resultType === "matched") {
        // Block only while this player already has an active queue row for this session
        const recentlyCheckedIn = await faceRecognitionService.isRecentlyCheckedIn(
          recognitionResult.playerId!,
          session.id
        );

        if (recentlyCheckedIn) {
          await prisma.faceAttempt.update({
            where: { id: faceAttempt.id },
            data: {
              resultType: "already_checked_in",
              matchedPlayerId: recognitionResult.playerId,
            },
          });

          return buildAlreadyCheckedInResponse(
            session.id,
            recognitionResult.playerId!,
            recognitionResult.displayName ?? undefined,
            faceDbg
          );
        }

        const existingEntry = await prisma.queueEntry.findUnique({
          where: {
            sessionId_playerId: {
              sessionId: session.id,
              playerId: recognitionResult.playerId!,
            },
          },
        });

        const queueNumber =
          existingEntry?.queueNumber != null
            ? existingEntry.queueNumber
            : await faceRecognitionService.getNextQueueNumber(session.id);

        let queueEntry;
        if (existingEntry) {
          // Player was in session before — re-activate them (keep same check-in # when set)
          queueEntry = await prisma.queueEntry.update({
            where: { id: existingEntry.id },
            data: {
              status: "waiting",
              queueNumber,
              joinedAt: new Date(), // reset join time for fair queue position
            },
            include: { player: true },
          });
        } else {
          // First time in this session — create fresh entry
          queueEntry = await prisma.queueEntry.create({
            data: {
              sessionId: session.id,
              playerId: recognitionResult.playerId!,
              status: "waiting",
              queueNumber,
            },
            include: { player: true },
          });
        }

        // Update face attempt log
        await prisma.faceAttempt.update({
          where: { id: faceAttempt.id },
          data: {
            resultType: "matched",
            matchedPlayerId: recognitionResult.playerId,
            confidence: recognitionResult.confidence,
            queueNumberAssigned: queueNumber,
          },
        });

        // Emit real-time update
        const allEntries = await prisma.queueEntry.findMany({
          where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
          include: {
            player: true,
            group: { include: { queueEntries: { where: { status: { not: "left" } }, include: { player: true } } } },
          },
          orderBy: { joinedAt: "asc" },
        });

        emitToVenue(venueId, "queue:updated", allEntries);

        // Create audit log
        await prisma.auditLog.create({
          data: {
            venueId,
            staffId: auth.id,
            action: "face_check_in_player",
            targetId: recognitionResult.playerId,
            metadata: { 
              queueEntryId: queueEntry.id, 
              sessionId: session.id,
              method: "face_recognition",
              confidence: recognitionResult.confidence,
              playerFound: true,
            },
          },
        });

        const pid = recognitionResult.playerId!;
        const queuePositionRaw = allEntries.findIndex((e) => e.playerId === pid) + 1;
        const totalSessions = await prisma.queueEntry.count({
          where: { playerId: pid, status: "left" },
        });

        result = {
          success: true,
          resultType: "matched",
          playerId: recognitionResult.playerId,
          displayName: recognitionResult.displayName,
          queueNumber,
          queuePosition: queuePositionRaw > 0 ? queuePositionRaw : undefined,
          skillLevel: queueEntry.player.skillLevel,
          totalSessions,
          isReturning: true,
          alreadyCheckedIn: false,
          confidence: recognitionResult.confidence,
        };
      } else if (recognitionResult.resultType === "new_player") {
        // Kiosk only checks in players already in AWS + DB; new players register via Check-in tab first.
        const existingPlayerByFace =
          recognitionResult.faceSubjectId != null &&
          recognitionResult.faceSubjectId !== ""
            ? await prisma.player.findFirst({
                where: { faceSubjectId: recognitionResult.faceSubjectId },
              })
            : null;

        if (existingPlayerByFace) {
          // Use existing player if face already exists
          const recentlyCheckedIn = await faceRecognitionService.isRecentlyCheckedIn(
            existingPlayerByFace.id,
            session.id
          );

          if (recentlyCheckedIn) {
            await prisma.faceAttempt.update({
              where: { id: faceAttempt.id },
              data: { resultType: "already_checked_in" },
            });

            return buildAlreadyCheckedInResponse(
              session.id,
              existingPlayerByFace.id,
              existingPlayerByFace.name,
              faceDbg
            );
          }

          const existingEntry = await prisma.queueEntry.findUnique({
            where: {
              sessionId_playerId: {
                sessionId: session.id,
                playerId: existingPlayerByFace.id,
              },
            },
          });

          const queueNumber =
            existingEntry?.queueNumber != null
              ? existingEntry.queueNumber
              : await faceRecognitionService.getNextQueueNumber(session.id);

          let queueEntry;
          if (existingEntry) {
            // Player was in session before — re-activate them (keep same check-in # when set)
            queueEntry = await prisma.queueEntry.update({
              where: { id: existingEntry.id },
              data: {
                status: "waiting",
                queueNumber,
                joinedAt: new Date(), // reset join time for fair queue position
              },
              include: { player: true },
            });
          } else {
            // First time in this session — create fresh entry
            queueEntry = await prisma.queueEntry.create({
              data: {
                sessionId: session.id,
                playerId: existingPlayerByFace.id,
                status: "waiting",
                queueNumber,
              },
              include: { player: true },
            });
          }

          await prisma.faceAttempt.update({
            where: { id: faceAttempt.id },
            data: {
              resultType: "matched",
              matchedPlayerId: existingPlayerByFace.id,
              confidence: recognitionResult.confidence,
              queueNumberAssigned: queueNumber,
            },
          });

          const allEntries = await prisma.queueEntry.findMany({
            where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
            include: {
              player: true,
              group: { include: { queueEntries: { where: { status: { not: "left" } }, include: { player: true } } } },
            },
            orderBy: { joinedAt: "asc" },
          });

          emitToVenue(venueId, "queue:updated", allEntries);

          await prisma.auditLog.create({
            data: {
              venueId,
              staffId: auth.id,
              action: "face_check_in_player",
              targetId: existingPlayerByFace.id,
              metadata: { 
                queueEntryId: queueEntry.id, 
                sessionId: session.id,
                method: "face_recognition",
                confidence: recognitionResult.confidence,
                playerFound: true,
                existingFacePlayer: true,
              },
            },
          });

          const eid = existingPlayerByFace.id;
          const queuePositionRawNp = allEntries.findIndex((e) => e.playerId === eid) + 1;
          const totalSessionsNp = await prisma.queueEntry.count({
            where: { playerId: eid, status: "left" },
          });

          result = {
            success: true,
            resultType: "matched",
            playerId: existingPlayerByFace.id,
            displayName: existingPlayerByFace.name,
            queueNumber,
            queuePosition: queuePositionRawNp > 0 ? queuePositionRawNp : undefined,
            skillLevel: queueEntry.player.skillLevel,
            totalSessions: totalSessionsNp,
            isReturning: true,
            alreadyCheckedIn: false,
            confidence: recognitionResult.confidence,
          };
        } else {
          await prisma.faceAttempt.update({
            where: { id: faceAttempt.id },
            data: { resultType: "needs_registration" },
          });

          return json({
            success: true,
            resultType: "needs_registration",
            ...faceDbg,
          });
        }
      } else {
        // Handle needs_review case
        await prisma.faceAttempt.update({
          where: { id: faceAttempt.id },
          data: { resultType: "needs_review" },
        });

        result = {
          success: true,
          resultType: "needs_review",
        };
      }
    } catch (error) {
      await prisma.faceAttempt.update({
        where: { id: faceAttempt.id },
        data: { resultType: "error" },
      });

      throw error;
    }

    return json({
      ...result,
      ...(faceDebugForResponse ? { faceDebug: faceDebugForResponse } : {}),
    });
  } catch (e) {
    console.error("[Kiosk Process Face] Error:", e);
    return error((e as Error).message, 500);
  }
}
