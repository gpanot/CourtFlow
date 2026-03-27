import { prisma } from "@/lib/db";
import { mockFaceRecognitionService } from "./face-recognition-mock";
import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  ListFacesCommand,
} from "@aws-sdk/client-rekognition";

const COLLECTION_ID = process.env.AWS_REKOGNITION_COLLECTION || "courtflow-players";

const USE_MOCK_SERVICE =
  !process.env.AWS_ACCESS_KEY_ID ||
  process.env.AWS_ACCESS_KEY_ID === "your-key-here";

const rekognition = USE_MOCK_SERVICE
  ? null
  : new RekognitionClient({
      region: process.env.AWS_REGION || "ap-southeast-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

export interface FaceRecognitionResult {
  success: boolean;
  resultType:
    | "matched"
    | "new_player"
    | "already_checked_in"
    | "needs_review"
    | "error";
  playerId?: string;
  displayName?: string;
  queueNumber?: number;
  confidence?: number;
  alreadyCheckedIn?: boolean;
  faceSubjectId?: string;
  error?: string;
}

export interface FaceEnrollmentResult {
  success: boolean;
  subjectId?: string;
  error?: string;
}

// ── Helper: base64 → Uint8Array (AWS SDK needs raw bytes) ─────────────────
function base64ToBytes(base64: string): Uint8Array {
  return Buffer.from(base64, "base64");
}

class FaceRecognitionService {

  // ── Ensure collection exists ─────────────────────────────────────────────
  private async ensureCollection(): Promise<void> {
    try {
      await rekognition!.send(
        new CreateCollectionCommand({ CollectionId: COLLECTION_ID })
      );
      console.log("[Rekognition] Collection created:", COLLECTION_ID);
    } catch (err: any) {
      // ResourceAlreadyExistsException is fine — collection already exists
      if (err?.name !== "ResourceAlreadyExistsException") {
        throw err;
      }
    }
  }

  // ── Enroll a face ────────────────────────────────────────────────────────
  async enrollFace(
    imageBase64: string,
    playerId: string
  ): Promise<FaceEnrollmentResult> {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.enrollFace(imageBase64, playerId);
    }

    try {
      await this.ensureCollection();

      const response = await rekognition!.send(
        new IndexFacesCommand({
          CollectionId: COLLECTION_ID,
          Image: { Bytes: base64ToBytes(imageBase64) },
          ExternalImageId: `player_${playerId}`,
          MaxFaces: 1,
          QualityFilter: "AUTO",
          DetectionAttributes: [],
        })
      );

      const faceRecord = response.FaceRecords?.[0]?.Face;
      if (!faceRecord?.FaceId) {
        return {
          success: false,
          error: "No face detected in enrollment image",
        };
      }

      // Store the AWS FaceId in the player record
      await prisma.player.update({
        where: { id: playerId },
        data: { faceSubjectId: faceRecord.FaceId },
      });

      console.log(`[Rekognition] Enrolled face for player ${playerId}:`, faceRecord.FaceId);
      return { success: true, subjectId: faceRecord.FaceId };
    } catch (err) {
      console.error("[Rekognition] Enrollment failed:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown enrollment error",
      };
    }
  }

  // ── Recognize a face ─────────────────────────────────────────────────────
  async recognizeFace(imageBase64: string): Promise<FaceRecognitionResult> {
    if (USE_MOCK_SERVICE) {
      if (imageBase64 === "test_image_no_camera") {
        return mockFaceRecognitionService.recognizeTestImage();
      }
      return mockFaceRecognitionService.recognizeFace(imageBase64);
    }

    try {
      await this.ensureCollection();

      const response = await rekognition!.send(
        new SearchFacesByImageCommand({
          CollectionId: COLLECTION_ID,
          Image: { Bytes: base64ToBytes(imageBase64) },
          MaxFaces: 1,
          FaceMatchThreshold: 85, // 85% confidence minimum
          QualityFilter: "AUTO",
        })
      );

      const matches = response.FaceMatches ?? [];

      if (matches.length === 0) {
        // No match found — new player
        return { success: true, resultType: "new_player" };
      }

      const bestMatch = matches[0];
      const confidence = bestMatch.Similarity ?? 0;
      const externalImageId = bestMatch.Face?.ExternalImageId ?? "";

      // Extract playerId from ExternalImageId (e.g. "player_clxxx...")
      const playerId = externalImageId.replace(/^player_/, "");

      const player = await prisma.player.findUnique({
        where: { id: playerId },
      });

      if (!player) {
        // Face exists in AWS but not in DB — treat as new player
        return { success: true, resultType: "new_player" };
      }

      console.log(
        `[Rekognition] Matched player ${player.name} with ${confidence.toFixed(1)}% confidence`
      );

      return {
        success: true,
        resultType: "matched",
        playerId,
        displayName: player.name,
        confidence,
      };
    } catch (err: any) {
      // InvalidParameterException = no face in image
      if (
        err?.name === "InvalidParameterException" &&
        err?.message?.includes("no faces")
      ) {
        return { success: true, resultType: "new_player" };
      }

      console.error("[Rekognition] Recognition failed:", err);
      return {
        success: false,
        resultType: "error",
        error: err instanceof Error ? err.message : "Unknown recognition error",
      };
    }
  }

  // ── Remove a face ────────────────────────────────────────────────────────
  async removeFace(playerId: string): Promise<boolean> {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.removeFace(playerId);
    }

    try {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
      });

      if (!player?.faceSubjectId) return true;

      await rekognition!.send(
        new DeleteFacesCommand({
          CollectionId: COLLECTION_ID,
          FaceIds: [player.faceSubjectId],
        })
      );

      await prisma.player.update({
        where: { id: playerId },
        data: { faceSubjectId: null },
      });

      return true;
    } catch (err) {
      console.error("[Rekognition] Face removal failed:", err);
      return false;
    }
  }

  // ── Health check ─────────────────────────────────────────────────────────
  async checkHealth(): Promise<boolean> {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.checkHealth();
    }
    try {
      await rekognition!.send(
        new ListFacesCommand({
          CollectionId: COLLECTION_ID,
          MaxResults: 1,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  // ── Queue helpers (unchanged) ────────────────────────────────────────────
  async getNextQueueNumber(sessionId: string): Promise<number> {
    const lastEntry = await prisma.queueEntry.findFirst({
      where: { sessionId, queueNumber: { not: null } },
      orderBy: { queueNumber: "desc" },
    });
    return (lastEntry?.queueNumber || 0) + 1;
  }

  async isRecentlyCheckedIn(
    playerId: string, 
    sessionId: string
  ): Promise<boolean> {
    const entry = await prisma.queueEntry.findUnique({
      where: {
        sessionId_playerId: {
          sessionId,
          playerId,
        },
      },
    });

    if (!entry) return false;

    // Only block re-check-in if player is 
    // currently active in the session
    return ["waiting", "assigned", "playing", "on_break"]
      .includes(entry.status);
  }

  getStats() {
    if (USE_MOCK_SERVICE) return mockFaceRecognitionService.getStats();
    return { enrolledPlayers: 0, isMock: false };
  }
}

export const faceRecognitionService = new FaceRecognitionService();
