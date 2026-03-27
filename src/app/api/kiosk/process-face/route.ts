import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  faceRecognitionService,
  type FaceRecognitionDebugInfo,
} from "@/lib/face-recognition";
import { emitToVenue } from "@/lib/socket-server";
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
        // Check if player is already checked in within 4 hours
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

          return json({
            success: true,
            resultType: "already_checked_in",
            playerId: recognitionResult.playerId,
            displayName: recognitionResult.displayName,
            alreadyCheckedIn: true,
            ...faceDbg,
          });
        }

        // Get next queue number and add to queue
        const queueNumber = await faceRecognitionService.getNextQueueNumber(session.id);

        // Check if player was previously in this session
        const existingEntry = await prisma.queueEntry.findUnique({
          where: {
            sessionId_playerId: {
              sessionId: session.id,
              playerId: recognitionResult.playerId!,
            },
          },
        });

        let queueEntry;
        if (existingEntry) {
          // Player was in session before — re-activate them
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

        result = {
          success: true,
          resultType: "matched",
          playerId: recognitionResult.playerId,
          displayName: recognitionResult.displayName,
          queueNumber,
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

            return json({
              success: true,
              resultType: "already_checked_in",
              playerId: existingPlayerByFace.id,
              displayName: existingPlayerByFace.name,
              alreadyCheckedIn: true,
              ...faceDbg,
            });
          }

          // Get next queue number and add to queue
          const queueNumber = await faceRecognitionService.getNextQueueNumber(session.id);

          // Check if player was previously in this session
          const existingEntry = await prisma.queueEntry.findUnique({
            where: {
              sessionId_playerId: {
                sessionId: session.id,
                playerId: existingPlayerByFace.id,
              },
            },
          });

          let queueEntry;
          if (existingEntry) {
            // Player was in session before — re-activate them
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

          result = {
            success: true,
            resultType: "matched",
            playerId: existingPlayerByFace.id,
            displayName: existingPlayerByFace.name,
            queueNumber,
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
