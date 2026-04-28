import { prisma } from "@/lib/db";

// Mock face recognition service for testing without AWS Rekognition
export interface FaceRecognitionResult {
  success: boolean;
  resultType: "matched" | "new_player" | "already_checked_in" | "needs_review" | "error";
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
  qualityError?: boolean;
}

export interface FaceDetectionResult {
  faceDetected: boolean;
  faceInfo?: {
    x: number;
    y: number;
    width: number;
    height: number;
    imageWidth: number;
    imageHeight: number;
  };
  brightness?: number;
  sharpness?: number;
}

class MockFaceRecognitionService {
  private mockPlayers = new Map<string, { name: string; faceSubjectId: string; enrolledAt: Date }>();

  /**
   * Mock face detection - simulates face detection and quality analysis
   */
  async detectFace(imageBase64: string): Promise<FaceDetectionResult> {
    try {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 500));

      // For demo purposes, simulate face detection with 90% success rate
      const faceDetected = Math.random() > 0.1; // 90% chance of detecting a face

      if (!faceDetected) {
        return {
          faceDetected: false,
        };
      }

      // Simulate face bounding box (centered, reasonable size)
      const imageWidth = 640;
      const imageHeight = 480;
      const faceWidth = Math.floor(imageWidth * (0.15 + Math.random() * 0.25)); // 15-40% of image width
      const faceHeight = Math.floor(faceWidth * 1.2); // Typical face aspect ratio
      const faceX = Math.floor((imageWidth - faceWidth) / 2 + (Math.random() - 0.5) * 100); // Some random offset
      const faceY = Math.floor((imageHeight - faceHeight) / 2 + (Math.random() - 0.5) * 50);

      // Simulate brightness and sharpness metrics
      const brightness = 0.3 + Math.random() * 0.5; // 0.3-0.8 range
      const sharpness = 0.4 + Math.random() * 0.5; // 0.4-0.9 range

      return {
        faceDetected: true,
        faceInfo: {
          x: Math.max(0, faceX),
          y: Math.max(0, faceY),
          width: faceWidth,
          height: faceHeight,
          imageWidth,
          imageHeight,
        },
        brightness,
        sharpness,
      };
    } catch (error) {
      console.error("Mock face detection failed:", error);
      return {
        faceDetected: false,
      };
    }
  }

  /** CourtPay staff capture — assume a face is present in mock mode. */
  async detectFacePresentForCourtPayPreview(
    _imageBase64: string
  ): Promise<{ faceDetected: boolean }> {
    return { faceDetected: true };
  }

  /**
   * Mock face enrollment - just stores the player info
   */
  async enrollFace(imageBase64: string, playerId: string): Promise<FaceEnrollmentResult> {
    try {
      // Get player details
      const player = await prisma.player.findUnique({
        where: { id: playerId },
      });

      if (!player) {
        return {
          success: false,
          error: "Player not found",
        };
      }

      // Store in mock database
      this.mockPlayers.set(playerId, {
        name: player.name,
        faceSubjectId: `face_${playerId}_${Date.now()}`, // Generate unique face ID
        enrolledAt: new Date(),
      });

      // Update player record with mock face subject ID
      await prisma.player.update({
        where: { id: playerId },
        data: { faceSubjectId: `mock_${playerId}` },
      });

      return {
        success: true,
        subjectId: `mock_${playerId}`,
      };
    } catch (error) {
      console.error("Mock face enrollment failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error during face enrollment",
      };
    }
  }

  /**
   * Mock face recognition - simulates realistic face detection and matching
   */
  async recognizeFace(imageBase64: string): Promise<FaceRecognitionResult> {
    try {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));

      // For demo purposes, simulate face detection with 95% success rate
      const faceDetected = Math.random() > 0.05; // 95% chance of detecting a face

      if (!faceDetected) {
        return {
          success: true,
          resultType: "new_player",
        };
      }

      // If we have enrolled players, try to match with high accuracy
      if (this.mockPlayers.size > 0) {
        // Simulate face matching with 85% accuracy for enrolled players
        const isMatch = Math.random() > 0.15; // 85% chance of matching existing player
        
        if (isMatch) {
          // Pick a random enrolled player (in real system, would match based on face features)
          const playerIds = Array.from(this.mockPlayers.keys());
          const randomPlayerId = playerIds[Math.floor(Math.random() * playerIds.length)];
          const mockPlayer = this.mockPlayers.get(randomPlayerId)!;

          // Get player details from database
          const player = await prisma.player.findUnique({
            where: { id: randomPlayerId },
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
            playerId: randomPlayerId,
            displayName: mockPlayer.name,
            confidence: 0.85 + Math.random() * 0.14, // 85-99% confidence
            faceSubjectId: mockPlayer.faceSubjectId
          };
        }
      }

      // Generate a new face subject ID for the new player
      const newFaceSubjectId = `face_new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      
      return {
        success: true,
        resultType: "new_player",
        faceSubjectId: newFaceSubjectId, // Return the new face ID
      };
    } catch (error) {
      console.error("Mock face recognition failed:", error);
      return {
        success: false,
        resultType: "error",
        error: error instanceof Error ? error.message : "Unknown error during face recognition",
      };
    }
  }

  /**
   * Mock face recognition with test image - for testing without camera
   */
  async recognizeTestImage(): Promise<FaceRecognitionResult> {
    // Use a simple test pattern as "image"
    const testImage = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    return this.recognizeFace(testImage);
  }

  /**
   * Mock face removal
   */
  async removeFace(playerId: string): Promise<boolean> {
    try {
      const player = await prisma.player.findUnique({
        where: { id: playerId },
      });

      if (!player?.faceSubjectId) {
        return true; // No face to remove
      }

      // Remove from mock database
      this.mockPlayers.delete(playerId);

      // Update player record
      await prisma.player.update({
        where: { id: playerId },
        data: { faceSubjectId: null },
      });

      return true;
    } catch (error) {
      console.error("Mock face removal failed:", error);
      return false;
    }
  }

  /**
   * Mock health check - always returns true
   */
  async checkHealth(): Promise<boolean> {
    // Simulate a brief delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
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

  /** True if this player already has a non–left queue row for this session (not time-based). */
  async isRecentlyCheckedIn(playerId: string, sessionId: string): Promise<boolean> {
    const entry = await prisma.queueEntry.findUnique({
      where: {
        sessionId_playerId: {
          sessionId,
          playerId,
        },
      },
    });

    if (!entry) return false;

    return ["waiting", "assigned", "playing", "on_break"]
      .includes(entry.status);
  }

  /**
   * Get mock statistics
   */
  getStats() {
    return {
      enrolledPlayers: this.mockPlayers.size,
      isMock: true,
    };
  }
}

export const mockFaceRecognitionService = new MockFaceRecognitionService();
