import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { SKILL_LEVELS, type SkillLevelType } from "@/lib/constants";
import {
  findLeftQueueEntryBySessionDisplayName,
  findQueueDisplayNameConflict,
} from "@/lib/queue-display-name";
import { faceRecognitionService } from "@/lib/face-recognition";
import { persistPlayerCheckInFacePhoto } from "@/lib/persist-player-check-in-photo";
import { analyzeFaceQuality } from "@/lib/face-quality";
import type { SkillLevel } from "@prisma/client";
import { initialRankingScoreForSkillLevel } from "@/lib/ranking";

// Helper function to get next queue number
async function getNextQueueNumber(sessionId: string): Promise<number> {
  const lastEntry = await prisma.queueEntry.findFirst({
    where: {
      sessionId,
      queueNumber: { not: null },
    },
    orderBy: { queueNumber: "desc" },
  });

  return (lastEntry?.queueNumber || 0) + 1;
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{
      venueId: string;
      name: string;
      gender: string;
      skillLevel: string;
      /** Optional; must be unique among players if provided. */
      phone?: string | null;
      imageBase64: string;
      forceAdd?: boolean;
    }>(request);

    const { venueId, name, gender: genderRaw, skillLevel: skillRaw, phone: phoneRaw, imageBase64, forceAdd } = body;
    
    if (!venueId?.trim()) return error("venueId is required", 400);
    const trimmedName = name?.trim() ?? "";
    if (!trimmedName) return error("Name is required", 400);
    if (genderRaw !== "male" && genderRaw !== "female") {
      return error("Gender must be male or female", 400);
    }
    const gender = genderRaw as "male" | "female";
    if (!SKILL_LEVELS.includes(skillRaw as SkillLevelType)) {
      return error("Invalid skill level", 400);
    }
    const skillLevel = skillRaw as SkillLevelType;

    if (!imageBase64?.trim()) return error("Face image is required", 400);

    // Analyze face quality
    const qualityAnalysis = await analyzeFaceQuality(imageBase64);
    
    // If quality is poor and not forced, return quality analysis
    if (qualityAnalysis.overall === 'poor' && !forceAdd) {
      return json({
        success: false,
        qualityCheck: qualityAnalysis,
        requiresRetake: true,
      }, 200);
    }

    const phoneTrimmed =
      typeof phoneRaw === "string" ? phoneRaw.trim() : "";
    const phone = phoneTrimmed.length > 0 ? phoneTrimmed : `walkin:${randomUUID()}`;

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });
    if (!session) return error("No active session found", 404);

    const conflict = await findQueueDisplayNameConflict(session.id, trimmedName);
    if (conflict) {
      return error(`"${conflict}" is already in the queue for this session`, 409);
    }

    const leftSameName = await findLeftQueueEntryBySessionDisplayName(session.id, trimmedName);
    if (leftSameName) {
      const existingPlayer = await prisma.player.findUnique({ where: { id: leftSameName.playerId } });
      if (!existingPlayer) {
        return error("Existing queue row references a missing player", 500);
      }

      const queueNumber =
        leftSameName.queueNumber != null
          ? leftSameName.queueNumber
          : await getNextQueueNumber(session.id);

      // Re-activate as checked-in (on_break = checked in, not in queue)
      const entry = await prisma.queueEntry.update({
        where: { id: leftSameName.entryId },
        data: {
          status: "on_break",
          queueNumber,
          groupId: null,
          breakUntil: null,
        },
        include: { player: true },
      });

      try {
        await persistPlayerCheckInFacePhoto(existingPlayer.id, imageBase64);
      } catch (e) {
        console.error("[StaffFace] check-in photo persist failed:", e);
      }

      let faceEnrollment: {
        success: boolean;
        awsFaceId?: string;
        error?: string;
      } = { success: !!existingPlayer.faceSubjectId };

      if (!existingPlayer.faceSubjectId) {
        const faceEnrollmentResult = await faceRecognitionService.enrollFace(
          imageBase64,
          existingPlayer.id
        );
        faceEnrollment = {
          success: faceEnrollmentResult.success,
          awsFaceId: faceEnrollmentResult.subjectId,
          error: faceEnrollmentResult.error,
        };
      }

      await prisma.auditLog.create({
        data: {
          venueId,
          staffId: auth.id,
          action: "walk_in_player_reactivated_with_face",
          targetId: existingPlayer.id,
          metadata: {
            queueEntryId: entry.id,
            sessionId: session.id,
            priorStatus: "left",
            faceEnrolled: faceEnrollment.success,
          },
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

      const rid = entry.playerId;
      const queuePositionRaw = allEntries.findIndex((e) => e.playerId === rid) + 1;
      const totalSessionsR = await prisma.queueEntry.count({
        where: { playerId: rid, status: "left" },
      });

      return json(
        {
          success: true,
          reactivated: true,
          player: {
            id: entry.player.id,
            name: entry.player.name,
            gender: entry.player.gender,
            skillLevel: entry.player.skillLevel,
          },
          queueEntryId: entry.id,
          queueNumber: entry.queueNumber,
          queuePosition: queuePositionRaw > 0 ? queuePositionRaw : undefined,
          totalSessions: totalSessionsR,
          qualityCheck: qualityAnalysis,
          faceEnrollment,
        },
        200
      );
    }

    let player;
    try {
      player = await prisma.player.create({
        data: {
          name: trimmedName,
          phone,
          gender,
          skillLevel,
          isWalkIn: true,
          avatar: "🏓",
          rankingScore: initialRankingScoreForSkillLevel(skillLevel as SkillLevel),
          registrationAt: new Date(),
          registrationVenueId: venueId,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return error("A player with this phone number already exists", 409);
      }
      throw e;
    }

    // Enroll face in AWS (same collection as kiosk SearchFacesByImage)
    let faceEnrollment: {
      success: boolean;
      awsFaceId?: string;
      error?: string;
    } = { success: false };

    try {
      console.log("[StaffFace] Add with face — saving profile + IndexFaces", {
        playerId: player.id,
        name: player.name,
        imageBase64Length: imageBase64.length,
        externalImageId: `player_${player.id}`,
      });

      const faceEnrollmentResult = await faceRecognitionService.enrollFace(
        imageBase64,
        player.id
      );

      faceEnrollment = {
        success: faceEnrollmentResult.success,
        awsFaceId: faceEnrollmentResult.subjectId,
        error: faceEnrollmentResult.error,
      };

      console.log("[StaffFace] IndexFaces result:", faceEnrollment);

      const after = await prisma.player.findUnique({
        where: { id: player.id },
        select: { faceSubjectId: true },
      });
      console.log(
        "[StaffFace] DB face_subject_id after enroll:",
        after?.faceSubjectId ?? "(null)"
      );

      if (!faceEnrollmentResult.success) {
        console.error(
          "[StaffFace] AWS enrollment FAILED — kiosk will treat this person as a stranger until enrollment works:",
          faceEnrollmentResult.error
        );
      }
    } catch (e) {
      console.error("[StaffFace] Face enrollment error:", e);
      faceEnrollment = {
        success: false,
        error: e instanceof Error ? e.message : "Unknown enrollment error",
      };
    }

    try {
      await persistPlayerCheckInFacePhoto(player.id, imageBase64);
    } catch (e) {
      console.error("[StaffFace] check-in photo persist failed:", e);
    }

    // Create as checked-in (on_break = checked in, not in queue)
    const entry = await prisma.queueEntry.create({
      data: {
        sessionId: session.id,
        playerId: player.id,
        status: "on_break",
        queueNumber: await getNextQueueNumber(session.id),
      },
      include: { player: true },
    });

    await prisma.auditLog.create({
      data: {
        venueId,
        staffId: auth.id,
        action: "walk_in_player_added_with_face",
        targetId: player.id,
        metadata: {
          queueEntryId: entry.id,
          sessionId: session.id,
          faceEnrolled: faceEnrollment.success,
          awsFaceId: faceEnrollment.awsFaceId,
        },
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

    const nid = player.id;
    const queuePositionNew = allEntries.findIndex((e) => e.playerId === nid) + 1;
    const totalSessionsNew = await prisma.queueEntry.count({
      where: { playerId: nid, status: "left" },
    });

    return json(
      {
        success: true,
        player: {
          id: player.id,
          name: player.name,
          gender: player.gender,
          skillLevel: player.skillLevel,
        },
        queueEntryId: entry.id,
        queueNumber: entry.queueNumber,
        queuePosition: queuePositionNew > 0 ? queuePositionNew : undefined,
        totalSessions: totalSessionsNew,
        qualityCheck: qualityAnalysis,
        faceEnrollment,
      },
      201
    );
  } catch (e) {
    console.error("[Staff Add Walk-in with Face] Error:", e);
    return error((e as Error).message, 500);
  }
}
