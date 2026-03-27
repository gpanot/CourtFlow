import { prisma } from "@/lib/db";
import { mockFaceRecognitionService } from "./face-recognition-mock";

// CompreFace API configuration
const COMPREFACE_API_URL = process.env.COMPREFACE_API_URL || "http://localhost:8000/api/v1";
const COMPREFACE_API_KEY = process.env.COMPREFACE_API_KEY;
const COMPREFACE_COLLECTION_NAME = process.env.COMPREFACE_COLLECTION_NAME || "courtflow_players";

// Use mock service if CompreFace is not configured
const USE_MOCK_SERVICE = !COMPREFACE_API_KEY || COMPREFACE_API_KEY === "your-api-key-here";

export interface FaceRecognitionResult {
  success: boolean;
  resultType: "matched" | "new_player" | "already_checked_in" | "needs_review" | "error";
  playerId?: string;
  displayName?: string;
  queueNumber?: number;
  confidence?: number;
  alreadyCheckedIn?: boolean;
  faceSubjectId?: string; // Added for linking face to player
  error?: string;
}

export interface FaceEnrollmentResult {
  success: boolean;
  subjectId?: string;
  error?: string;
}

class FaceRecognitionService {
  private headers = {
    "x-api-key": COMPREFACE_API_KEY || "",
    "Content-Type": "application/json",
  };

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    try {
      const response = await fetch(`${COMPREFACE_API_URL}${endpoint}`, {
        headers: this.headers,
        ...options,
      });

      if (!response.ok) {
        throw new Error(`CompreFace API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error("CompreFace API request failed:", error);
      throw error;
    }
  }

  /**
   * Enroll a new face in the recognition system
   */
  async enrollFace(imageBase64: string, playerId: string): Promise<FaceEnrollmentResult> {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.enrollFace(imageBase64, playerId);
    }

    try {
      // Create face subject
      const subjectData = await this.makeRequest("/face-subject", {
        method: "POST",
        body: JSON.stringify({
          subject: `player_${playerId}`,
        }),
      });

      // Add face image to subject
      const faceData = await this.makeRequest("/recognition/face", {
        method: "POST",
        body: JSON.stringify({
          face_collection_name: COMPREFACE_COLLECTION_NAME,
          subject: `player_${playerId}`,
          image_base64: imageBase64,
        }),
      });

      // Update player record with face subject ID
      await prisma.player.update({
        where: { id: playerId },
        data: { faceSubjectId: `player_${playerId}` },
      });

      return {
        success: true,
        subjectId: `player_${playerId}`,
      };
    } catch (error) {
      console.error("Face enrollment failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error during face enrollment",
      };
    }
  }

  /**
   * Recognize a face from image
   */
  async recognizeFace(imageBase64: string): Promise<FaceRecognitionResult> {
    if (USE_MOCK_SERVICE) {
      // Handle test image case
      if (imageBase64 === "test_image_no_camera") {
        return mockFaceRecognitionService.recognizeTestImage();
      }
      return mockFaceRecognitionService.recognizeFace(imageBase64);
    }

    try {
      const result = await this.makeRequest("/recognition/recognize", {
        method: "POST",
        body: JSON.stringify({
          face_collection_name: COMPREFACE_COLLECTION_NAME,
          image_base64: imageBase64,
          limit: 1,
          threshold: 0.7,
        }),
      });

      if (result.result && result.result.length > 0) {
        const match = result.result[0];
        const subjectId = match.subject;
        const confidence = match.similarity;

        // Extract player ID from subject ID
        const playerId = subjectId.replace("player_", "");

        // Get player details
        const player = await prisma.player.findUnique({
          where: { id: playerId },
        });

        if (!player) {
          return {
            success: false,
            resultType: "error",
            error: "Player not found for matched face",
          };
        }

        return {
          success: true,
          resultType: "matched",
          playerId,
          displayName: player.name,
          confidence,
        };
      } else {
        return {
          success: true,
          resultType: "new_player",
        };
      }
    } catch (error) {
      console.error("Face recognition failed:", error);
      return {
        success: false,
        resultType: "error",
        error: error instanceof Error ? error.message : "Unknown error during face recognition",
      };
    }
  }

  /**
   * Remove a face from the recognition system
   */
  async removeFace(playerId: string): Promise<boolean> {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.removeFace(playerId);
    }

    try {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
      });

      if (!player?.faceSubjectId) {
        return true; // No face to remove
      }

      // Delete face subject
      await this.makeRequest(`/face-subject/${player.faceSubjectId}`, {
        method: "DELETE",
      });

      // Update player record
      await prisma.player.update({
        where: { id: playerId },
        data: { faceSubjectId: null },
      });

      return true;
    } catch (error) {
      console.error("Face removal failed:", error);
      return false;
    }
  }

  /**
   * Check if CompreFace service is available
   */
  async checkHealth(): Promise<boolean> {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.checkHealth();
    }

    try {
      await this.makeRequest("/health");
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get next available queue number for a session
   */
  async getNextQueueNumber(sessionId: string): Promise<number> {
    const lastEntry = await prisma.queueEntry.findFirst({
      where: {
        sessionId,
        queueNumber: { not: null },
      },
      orderBy: { queueNumber: "desc" },
    });

    return (lastEntry?.queueNumber || 0) + 1;
  }

  /**
   * Check if player is already checked in within 4 hours
   */
  async isRecentlyCheckedIn(playerId: string, sessionId: string): Promise<boolean> {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    
    const recentEntry = await prisma.queueEntry.findFirst({
      where: {
        playerId,
        sessionId,
        joinedAt: { gte: fourHoursAgo },
        status: { in: ["waiting", "assigned", "playing"] },
      },
    });

    return !!recentEntry;
  }

  /**
   * Get service statistics
   */
  getStats() {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.getStats();
    }

    return {
      enrolledPlayers: 0, // Would need to implement CompreFace API call
      isMock: false,
    };
  }
}

export const faceRecognitionService = new FaceRecognitionService();
