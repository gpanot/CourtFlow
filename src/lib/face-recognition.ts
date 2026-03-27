import { prisma } from "@/lib/db";
import { mockFaceRecognitionService } from "./face-recognition-mock";

const COMPREFACE_API_URL = process.env.COMPREFACE_API_URL || "http://localhost:8000/api/v1";
const COMPREFACE_API_KEY = process.env.COMPREFACE_API_KEY;

const USE_MOCK_SERVICE = !COMPREFACE_API_KEY || COMPREFACE_API_KEY === "your-api-key-here";

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

// ── Helper: base64 → Blob ──────────────────────────────────────────────────
function base64ToBlob(base64: string, mimeType = "image/jpeg"): Blob {
  const byteString = atob(base64);
  const buffer = new ArrayBuffer(byteString.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < byteString.length; i++) {
    view[i] = byteString.charCodeAt(i);
  }
  return new Blob([buffer], { type: mimeType });
}

class FaceRecognitionService {

  // ── Core request helper ──────────────────────────────────────────────────
  // NOTE: do NOT set Content-Type here — let fetch set it automatically
  //       for FormData (it needs to include the boundary parameter).
  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${COMPREFACE_API_URL}${endpoint}`;
    console.log(`[CompreFace] ${options.method ?? "GET"} ${url}`);

    const response = await fetch(url, {
      ...options,
      headers: {
        "x-api-key": COMPREFACE_API_KEY || "",
        // ✅ Only pass x-api-key — never set Content-Type for FormData
        ...(options.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `CompreFace API error: ${response.status} ${response.statusText}${body ? ` — ${body}` : ""}`
      );
    }

    return response.json();
  }

  // ── Enroll a face ────────────────────────────────────────────────────────
  async enrollFace(imageBase64: string, playerId: string): Promise<FaceEnrollmentResult> {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.enrollFace(imageBase64, playerId);
    }

    try {
      const subjectId = `player_${playerId}`;

      // ✅ CORRECT endpoint: POST /recognition/faces?subject=player_xxx
      //    Body: multipart/form-data with a "file" field
      //    (NOT JSON, NOT /recognition/face, NOT /face-subject)
      const formData = new FormData();
      formData.append("file", base64ToBlob(imageBase64), "face.jpg");

      await this.makeRequest(
        `/recognition/faces?subject=${encodeURIComponent(subjectId)}`,
        { method: "POST", body: formData }
      );

      await prisma.player.update({
        where: { id: playerId },
        data: { faceSubjectId: subjectId },
      });

      return { success: true, subjectId };
    } catch (err) {
      console.error("Face enrollment failed:", err);
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
      // ✅ CORRECT endpoint: POST /recognition/recognize
      //    Body: multipart/form-data with a "file" field
      //    Optional query params: limit, det_prob_threshold
      //    (NOT JSON body, NOT /recognition/identify)
      const formData = new FormData();
      formData.append("file", base64ToBlob(imageBase64), "frame.jpg");

      const result = await this.makeRequest(
        "/recognition/recognize?limit=1&det_prob_threshold=0.8",
        { method: "POST", body: formData }
      );

      // CompreFace response shape:
      // { result: [ { subjects: [ { subject, similarity } ], ... } ] }
      const faces = result?.result ?? [];

      if (faces.length === 0) {
        // No face detected in image
        return { success: true, resultType: "new_player" };
      }

      const face = faces[0];
      const subjects: Array<{ subject: string; similarity: number }> =
        face?.subjects ?? [];

      if (subjects.length === 0 || subjects[0].similarity < 0.85) {
        // Face detected but no confident match → new player
        return {
          success: true,
          resultType: "new_player",
          faceSubjectId: undefined,
        };
      }

      const bestMatch = subjects[0];
      const subjectId = bestMatch.subject;          // e.g. "player_clxxx..."
      const confidence = bestMatch.similarity;

      // Extract playerId from subjectId
      const playerId = subjectId.replace(/^player_/, "");

      const player = await prisma.player.findUnique({ where: { id: playerId } });

      if (!player) {
        // Subject exists in CompreFace but not in DB — treat as new
        return { success: true, resultType: "new_player" };
      }

      return {
        success: true,
        resultType: "matched",
        playerId,
        displayName: player.name,
        confidence,
      };
    } catch (err) {
      console.error("Face recognition failed:", err);
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
      const player = await prisma.player.findUnique({ where: { id: playerId } });
      if (!player?.faceSubjectId) return true;

      // ✅ CORRECT endpoint: DELETE /recognition/subjects/:subject
      //    (NOT /face-subject/:id)
      await this.makeRequest(
        `/recognition/subjects/${encodeURIComponent(player.faceSubjectId)}`,
        { method: "DELETE" }
      );

      await prisma.player.update({
        where: { id: playerId },
        data: { faceSubjectId: null },
      });

      return true;
    } catch (err) {
      console.error("Face removal failed:", err);
      return false;
    }
  }

  // ── Health check ─────────────────────────────────────────────────────────
  async checkHealth(): Promise<boolean> {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.checkHealth();
    }
    try {
      // ✅ CORRECT endpoint: GET /actuator/health
      //    (NOT /health)
      //    Note: this is on the BASE url, not /api/v1
      const baseUrl = COMPREFACE_API_URL.replace("/api/v1", "");
      const response = await fetch(`${baseUrl}/actuator/health`, {
        headers: { "x-api-key": COMPREFACE_API_KEY || "" },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ── Queue helpers ────────────────────────────────────────────────────────
  async getNextQueueNumber(sessionId: string): Promise<number> {
    const lastEntry = await prisma.queueEntry.findFirst({
      where: { sessionId, queueNumber: { not: null } },
      orderBy: { queueNumber: "desc" },
    });
    return (lastEntry?.queueNumber || 0) + 1;
  }

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

  getStats() {
    if (USE_MOCK_SERVICE) return mockFaceRecognitionService.getStats();
    return { enrolledPlayers: 0, isMock: false };
  }
}

export const faceRecognitionService = new FaceRecognitionService();