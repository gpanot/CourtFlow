import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";
import { emitToVenue } from "@/lib/socket-server";
import { SKILL_LEVELS, type SkillLevelType } from "@/lib/constants";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{
      venueId: string;
      imageBase64: string;
      kioskId?: string;
    }>(request);

    const { venueId, imageBase64, kioskId } = body;

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

    try {
      // Recognize face
      const recognitionResult = await faceRecognitionService.recognizeFace(imageBase64);

      if (recognitionResult.resultType === "error") {
        await prisma.faceAttempt.update({
          where: { id: faceAttempt.id },
          data: { resultType: "error" },
        });

        return json({
          success: false,
          resultType: "error",
          error: recognitionResult.error,
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
          });
        }

        // Get next queue number and add to queue
        const queueNumber = await faceRecognitionService.getNextQueueNumber(session.id);

        const queueEntry = await prisma.queueEntry.create({
          data: {
            sessionId: session.id,
            playerId: recognitionResult.playerId!,
            status: "waiting",
            queueNumber,
          },
          include: { player: true },
        });

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
        // Check if there's an existing player with the same face (shouldn't happen, but safety check)
        const existingPlayerByFace = await prisma.player.findFirst({
          where: { faceSubjectId: recognitionResult.faceSubjectId },
        });

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
            });
          }

          // Get next queue number and add to queue
          const queueNumber = await faceRecognitionService.getNextQueueNumber(session.id);

          const queueEntry = await prisma.queueEntry.create({
            data: {
              sessionId: session.id,
              playerId: existingPlayerByFace.id,
              status: "waiting",
              queueNumber,
            },
            include: { player: true },
          });

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
          // Create new player with faceSubjectId from CompreFace
          const newPlayer = await prisma.player.create({
            data: {
              name: `Player ${Date.now()}`,
              phone: `face_checkin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              gender: "other",
              skillLevel: "beginner",
              avatar: "🏓",
              faceSubjectId: recognitionResult.faceSubjectId, // Save the face ID from CompreFace
            },
          });

          // Enroll face
          const enrollmentResult = await faceRecognitionService.enrollFace(
            imageBase64,
            newPlayer.id
          );

          if (!enrollmentResult.success) {
            // Clean up player if enrollment failed
            await prisma.player.delete({ where: { id: newPlayer.id } });
            
            await prisma.faceAttempt.update({
              where: { id: faceAttempt.id },
              data: { resultType: "error" },
            });

            return json({
              success: false,
              resultType: "error",
              error: "Failed to enroll face for new player",
            });
          }

          // Get next queue number and add to queue
          const queueNumber = await faceRecognitionService.getNextQueueNumber(session.id);

          const queueEntry = await prisma.queueEntry.create({
            data: {
              sessionId: session.id,
              playerId: newPlayer.id,
              status: "waiting",
              queueNumber,
            },
            include: { player: true },
          });

          await prisma.faceAttempt.update({
            where: { id: faceAttempt.id },
            data: {
              resultType: "new_player",
              matchedPlayerId: newPlayer.id,
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
              targetId: newPlayer.id,
              metadata: { 
                queueEntryId: queueEntry.id, 
                sessionId: session.id,
                method: "face_recognition",
                newPlayerCreated: true,
                faceSubjectId: recognitionResult.faceSubjectId,
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

    return json(result);
  } catch (e) {
    console.error("[Kiosk Process Face] Error:", e);
    return error((e as Error).message, 500);
  }
}
