import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { SKILL_LEVELS, type SkillLevelType } from "@/lib/constants";
import { findQueueDisplayNameConflict } from "@/lib/queue-display-name";
import { mockFaceRecognitionService } from "@/lib/face-recognition-mock";

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

// Face quality analysis function
async function analyzeFaceQuality(imageBase64: string): Promise<{
  overall: 'good' | 'fair' | 'poor';
  checks: {
    faceDetected: boolean;
    lighting: 'good' | 'fair' | 'poor';
    focus: 'good' | 'fair' | 'poor';
    size: 'good' | 'fair' | 'poor';
  };
  message: string;
  canForce: boolean;
}> {
  try {
    // For now, use mock analysis - in production, this would use actual face detection
    // Simulate face quality analysis with some randomness
    const random = Math.random();
    
    let checks = {
      faceDetected: true,
      lighting: 'good' as 'good' | 'fair' | 'poor',
      focus: 'good' as 'good' | 'fair' | 'poor',
      size: 'good' as 'good' | 'fair' | 'poor',
    };

    let overall: 'good' | 'fair' | 'poor' = 'good';
    let message = 'Photo quality looks good!';
    let canForce = false;

    // Simulate different quality scenarios
    if (random < 0.3) {
      // 30% chance of poor quality
      overall = 'poor';
      checks.lighting = 'poor';
      checks.focus = 'poor';
      message = 'Poor lighting and focus. Please retake photo in better light.';
      canForce = true;
    } else if (random < 0.6) {
      // 30% chance of fair quality
      overall = 'fair';
      checks.lighting = 'fair';
      message = 'Fair quality. Consider retaking for better recognition.';
      canForce = true;
    }

    return {
      overall,
      checks,
      message,
      canForce,
    };
  } catch (e) {
    return {
      overall: 'poor',
      checks: {
        faceDetected: false,
        lighting: 'poor',
        focus: 'poor',
        size: 'poor',
      },
      message: 'Unable to analyze photo quality. Please retake.',
      canForce: false,
    };
  }
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

    let player;
    try {
      player = await prisma.player.create({
        data: {
          name: trimmedName,
          phone,
          gender,
          skillLevel,
          avatar: "🏓",
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002") {
        return error("A player with this phone number already exists", 409);
      }
      throw e;
    }

    // Enroll face for this player
    try {
      const faceEnrollmentResult = await mockFaceRecognitionService.enrollFace(imageBase64, player.id);
      if (!faceEnrollmentResult.success) {
        console.error("Face enrollment failed:", faceEnrollmentResult.error);
        // Continue anyway - player is added even if face enrollment fails
      }
    } catch (e) {
      console.error("Face enrollment error:", e);
      // Continue anyway
    }

    const entry = await prisma.queueEntry.create({
      data: {
        sessionId: session.id,
        playerId: player.id,
        status: "waiting",
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
        metadata: { queueEntryId: entry.id, sessionId: session.id, faceEnrolled: true },
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
        qualityCheck: qualityAnalysis,
      },
      201
    );
  } catch (e) {
    console.error("[Staff Add Walk-in with Face] Error:", e);
    return error((e as Error).message, 500);
  }
}
