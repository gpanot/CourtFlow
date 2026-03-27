import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { SKILL_LEVELS, type SkillLevelType } from "@/lib/constants";
import { findQueueDisplayNameConflict } from "@/lib/queue-display-name";
import { faceRecognitionService } from "@/lib/face-recognition";
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
    // Convert base64 to buffer for analysis
    const imageBuffer = Buffer.from(imageBase64, 'base64');
    
    // Basic image validation
    if (imageBuffer.length < 1000) {
      return {
        overall: 'poor',
        checks: {
          faceDetected: false,
          lighting: 'poor',
          focus: 'poor',
          size: 'poor',
        },
        message: 'Image too small or corrupted. Please retake photo.',
        canForce: false,
      };
    }

    // For now, use mock face recognition service for detection
    // In production, this would use a proper face detection library
    const faceDetectionResult = await mockFaceRecognitionService.detectFace(imageBase64);
    
    let checks = {
      faceDetected: faceDetectionResult.faceDetected,
      lighting: 'good' as 'good' | 'fair' | 'poor',
      focus: 'good' as 'good' | 'fair' | 'poor',
      size: 'good' as 'good' | 'fair' | 'poor',
    };

    let overall: 'good' | 'fair' | 'poor' = 'good';
    let message = 'Photo quality looks good!';
    let canForce = false;

    if (!checks.faceDetected) {
      overall = 'poor';
      message = 'No face detected. Please ensure your face is clearly visible in the photo.';
      canForce = false;
    } else {
      // Analyze face size and position if face is detected
      const faceInfo = faceDetectionResult.faceInfo;
      
      if (faceInfo) {
        // Check face size (should be at least 20% of image dimensions)
        const faceSizeRatio = (faceInfo.width * faceInfo.height) / (faceInfo.imageWidth * faceInfo.imageHeight);
        if (faceSizeRatio < 0.05) {
          checks.size = 'poor';
          overall = 'poor';
          message = 'Face too small. Please move closer to the camera.';
          canForce = true;
        } else if (faceSizeRatio < 0.1) {
          checks.size = 'fair';
          if (overall === 'good') overall = 'fair';
          message = 'Face could be larger for better recognition.';
          canForce = true;
        }

        // Check face position (should be reasonably centered)
        const faceCenterX = faceInfo.x + faceInfo.width / 2;
        const faceCenterY = faceInfo.y + faceInfo.height / 2;
        const imageCenterX = faceInfo.imageWidth / 2;
        const imageCenterY = faceInfo.imageHeight / 2;
        
        const maxOffset = Math.min(faceInfo.imageWidth, faceInfo.imageHeight) * 0.3;
        const offsetX = Math.abs(faceCenterX - imageCenterX);
        const offsetY = Math.abs(faceCenterY - imageCenterY);
        
        if (offsetX > maxOffset || offsetY > maxOffset) {
          if (overall === 'good') overall = 'fair';
          message = 'Please center your face in the photo for better results.';
          canForce = true;
        }
      }

      // Simulate lighting analysis based on image brightness
      // In production, this would use actual brightness histogram analysis
      const brightness = faceDetectionResult.brightness || 0.5;
      if (brightness < 0.3) {
        checks.lighting = 'poor';
        overall = 'poor';
        message = 'Poor lighting. Please take photo in better lighting conditions.';
        canForce = true;
      } else if (brightness < 0.6) {
        checks.lighting = 'fair';
        if (overall === 'good') overall = 'fair';
        message = 'Lighting could be better. Consider using more light.';
        canForce = true;
      }

      // Simulate focus analysis
      // In production, this would use edge detection or sharpness metrics
      const sharpness = faceDetectionResult.sharpness || 0.7;
      if (sharpness < 0.4) {
        checks.focus = 'poor';
        overall = 'poor';
        message = 'Image appears blurry. Please keep camera steady and retake photo.';
        canForce = true;
      } else if (sharpness < 0.6) {
        checks.focus = 'fair';
        if (overall === 'good') overall = 'fair';
        message = 'Image could be sharper. Please keep camera steady.';
        canForce = true;
      }

      // Update message for good quality
      if (overall === 'good') {
        message = 'Perfect! Face detected with good quality.';
      }
    }

    return {
      overall,
      checks,
      message,
      canForce,
    };
  } catch (e) {
    console.error('Face quality analysis error:', e);
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
        faceEnrollment,
      },
      201
    );
  } catch (e) {
    console.error("[Staff Add Walk-in with Face] Error:", e);
    return error((e as Error).message, 500);
  }
}
