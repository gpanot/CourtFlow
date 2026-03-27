import { prisma } from "@/lib/db";

// Mock face recognition service for testing without CompreFace
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
}

class MockFaceRecognitionService {
  private mockPlayers = new Map<string, { name: string; faceSubjectId: string; enrolledAt: Date }>();

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
   * Mock face recognition - simulates face detection
   */
  async recognizeFace(imageBase64: string): Promise<FaceRecognitionResult> {
    try {
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 1000));

      // For demo purposes, randomly decide if it's a new or returning player
      const isReturningPlayer = Math.random() > 0.3; // 70% chance of returning player

      if (isReturningPlayer && this.mockPlayers.size > 0) {
        // Pick a random enrolled player
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
      } else {
        // Generate a new face subject ID for the new player
        const newFaceSubjectId = `face_new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        return {
          success: true,
          resultType: "new_player",
          faceSubjectId: newFaceSubjectId, // Return the new face ID
        };
      }
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
