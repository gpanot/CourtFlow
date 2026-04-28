import { prisma } from "@/lib/db";
import { mockFaceRecognitionService } from "./face-recognition-mock";
import {
  RekognitionClient,
  CreateCollectionCommand,
  ListCollectionsCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  ListFacesCommand,
  DetectFacesCommand,
} from "@aws-sdk/client-rekognition";
import { COLLECTION_ID, FACE_MATCH_THRESHOLD } from "@/lib/rekognition-config";

export { FACE_MATCH_THRESHOLD } from "@/lib/rekognition-config";

export const USE_MOCK_SERVICE =
  !process.env.AWS_ACCESS_KEY_ID ||
  process.env.AWS_ACCESS_KEY_ID === "your-key-here" ||
  process.env.AWS_ACCESS_KEY_ID.trim() === "";

if (process.env.NODE_ENV === "production" && USE_MOCK_SERVICE) {
  console.error(
    "[FaceRecognition] CRITICAL: Mock mode is active in production. AWS_ACCESS_KEY_ID is missing or invalid. All face enrollments and recognition calls will be fake."
  );
}

console.log(
  "[FaceRecognition] Mode:",
  USE_MOCK_SERVICE ? "MOCK" : "AWS Rekognition"
);
console.log(
  "[FaceRecognition] AWS Key present:",
  !!process.env.AWS_ACCESS_KEY_ID
);
console.log("[FaceRecognition] AWS Region:", process.env.AWS_REGION);
console.log(`[FaceRecognition] Collection: ${COLLECTION_ID}`);
console.log(`[FaceRecognition] Environment: ${process.env.NODE_ENV}`);

if (
  process.env.NODE_ENV === "production" &&
  COLLECTION_ID.includes("staging")
) {
  console.error(
    "[FaceRecognition] CRITICAL: Production is pointed at a staging collection. Check AWS_REKOGNITION_COLLECTION env var."
  );
}

if (
  process.env.NODE_ENV !== "production" &&
  COLLECTION_ID.includes("prod") &&
  !COLLECTION_ID.includes("staging")
) {
  console.warn(
    "[FaceRecognition] WARNING: Non-production environment is pointed at a prod collection. Check AWS_REKOGNITION_COLLECTION env var."
  );
}

const rekognition = USE_MOCK_SERVICE
  ? null
  : new RekognitionClient({
      region: process.env.AWS_REGION || "ap-southeast-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

/** Populated when recognizeFace(..., { debug: true }) for kiosk/staff diagnostics */
export interface FaceRecognitionDebugInfo {
  mode: "MOCK" | "AWS";
  collectionId?: string;
  awsQueried: boolean;
  faceMatchCount?: number;
  topMatch?: {
    similarity?: number;
    externalImageId?: string;
    faceId?: string;
  } | null;
  externalPlayerIdFromAws?: string | null;
  dbPlayerFound?: boolean;
  dbPlayerName?: string | null;
  interpretation: string;
}

/** Similarity scores for logging / DB (SearchFacesByImage best match vs production threshold). */
export interface FaceRecognitionAttemptMeta {
  similarityScore: number | null;
  threshold: number;
  passedThreshold: boolean;
}

export interface RecognizeFaceOptions {
  debug?: boolean;
  venueId?: string;
  staffId?: string;
}

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
  recognitionDebug?: FaceRecognitionDebugInfo;
  attemptMeta?: FaceRecognitionAttemptMeta;
}

export interface FaceEnrollmentResult {
  success: boolean;
  subjectId?: string;
  error?: string;
  /** True when failure is due to DetectFaces / enrollment quality rules — client should prompt retake. */
  qualityError?: boolean;
}

// ── Helper: base64 → Uint8Array (AWS SDK needs raw bytes) ─────────────────
function base64ToBytes(base64: string): Uint8Array {
  return Buffer.from(base64, "base64");
}

/** Strip data-URL prefix so Rekognition receives raw base64 payload bytes. */
function normalizeEnrollmentBase64(imageBase64: string): string {
  const t = imageBase64.trim();
  const comma = t.indexOf(",");
  if (t.startsWith("data:") && comma >= 0) {
    return t.slice(comma + 1).trim();
  }
  return t;
}

function enrollmentImageBytes(imageBase64: string): Uint8Array {
  return Buffer.from(normalizeEnrollmentBase64(imageBase64), "base64");
}

const ENROLLMENT_FACE_MIN_CONFIDENCE = 90;
const ENROLLMENT_POSE_MAX_ABS_DEG = 30;

type EnrollmentQualityGate =
  | { pass: true }
  | { pass: false; error: string; qualityError: boolean };

/** Fire-and-forget row per SearchFacesByImage call when venueId is present. */
function queueFaceRecognitionRow(params: {
  venueId?: string;
  staffId?: string;
  playerId?: string | null;
  similarityScore: number;
  passed: boolean;
}) {
  const vid = params.venueId?.trim();
  if (!vid) return;

  const threshold = FACE_MATCH_THRESHOLD;
  void prisma.faceRecognitionLog
    .create({
      data: {
        venueId: vid,
        staffId: params.staffId ?? undefined,
        playerId: params.playerId ?? undefined,
        similarityScore: params.similarityScore,
        threshold,
        passed: params.passed,
      },
    })
    .catch((e) => console.error("[FaceRecognitionLog]", e));
}

function mockAttemptMeta(result: FaceRecognitionResult): FaceRecognitionAttemptMeta {
  let similarityScore: number | null = null;
  if (typeof result.confidence === "number") {
    similarityScore =
      result.confidence <= 1 ? result.confidence * 100 : result.confidence;
  }
  const passedThreshold =
    similarityScore != null && similarityScore >= FACE_MATCH_THRESHOLD;
  return {
    similarityScore,
    threshold: FACE_MATCH_THRESHOLD,
    passedThreshold,
  };
}

function appendMockAttemptLog(
  result: FaceRecognitionResult,
  options?: RecognizeFaceOptions
): FaceRecognitionResult {
  const meta = mockAttemptMeta(result);
  console.log(
    "[Rekognition][FaceRecognitionAttempt]",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      rekognitionOperation: "SearchFacesByImage",
      venueId: options?.venueId ?? null,
      staffId: options?.staffId ?? null,
      similarityScore: meta.similarityScore,
      threshold: meta.threshold,
      passedThreshold: meta.passedThreshold,
      resultType: result.resultType,
      mode: "MOCK",
    })
  );
  queueFaceRecognitionRow({
    venueId: options?.venueId,
    staffId: options?.staffId,
    playerId: result.resultType === "matched" ? result.playerId ?? null : null,
    similarityScore: meta.similarityScore ?? 0,
    passed: result.resultType === "matched",
  });
  return { ...result, attemptMeta: meta };
}

function finalizeAwsRecognition(
  result: FaceRecognitionResult,
  similarityScore: number | null,
  options?: RecognizeFaceOptions,
  extra?: Record<string, unknown>
): FaceRecognitionResult {
  const passedThreshold =
    similarityScore != null && similarityScore >= FACE_MATCH_THRESHOLD;
  const meta: FaceRecognitionAttemptMeta = {
    similarityScore,
    threshold: FACE_MATCH_THRESHOLD,
    passedThreshold,
  };
  console.log(
    "[Rekognition][FaceRecognitionAttempt]",
    JSON.stringify({
      timestamp: new Date().toISOString(),
      rekognitionOperation: "SearchFacesByImage",
      venueId: options?.venueId ?? null,
      staffId: options?.staffId ?? null,
      collectionId: COLLECTION_ID,
      similarityScore,
      threshold: FACE_MATCH_THRESHOLD,
      passedThreshold,
      resultType: result.resultType,
      mode: "AWS",
      ...extra,
    })
  );
  return { ...result, attemptMeta: meta };
}

class FaceRecognitionService {

  /**
   * AWS DetectFaces (ALL) before IndexFaces — rejects unusable enrollment photos.
   * Mock mode skips (no AWS call).
   */
  private async assertEnrollmentPhotoQuality(
    imageBase64: string
  ): Promise<EnrollmentQualityGate> {
    if (USE_MOCK_SERVICE) {
      return { pass: true };
    }

    const bytes = enrollmentImageBytes(imageBase64);
    if (bytes.length < 100) {
      return {
        pass: false,
        error: "No face detected, please try again",
        qualityError: true,
      };
    }

    try {
      const response = await rekognition!.send(
        new DetectFacesCommand({
          Image: { Bytes: bytes },
          Attributes: ["ALL"],
        })
      );

      const faces = response.FaceDetails ?? [];
      if (faces.length === 0) {
        return {
          pass: false,
          error: "No face detected, please try again",
          qualityError: true,
        };
      }
      if (faces.length > 1) {
        return {
          pass: false,
          error: "Multiple faces detected, please ensure only one person is in frame",
          qualityError: true,
        };
      }

      const face = faces[0];
      const conf = face.Confidence ?? 0;
      if (conf < ENROLLMENT_FACE_MIN_CONFIDENCE) {
        return {
          pass: false,
          error: "Photo quality too low, please try again",
          qualityError: true,
        };
      }

      const pitch = face.Pose?.Pitch ?? 0;
      const roll = face.Pose?.Roll ?? 0;
      const yaw = face.Pose?.Yaw ?? 0;
      if (
        Math.abs(pitch) > ENROLLMENT_POSE_MAX_ABS_DEG ||
        Math.abs(roll) > ENROLLMENT_POSE_MAX_ABS_DEG ||
        Math.abs(yaw) > ENROLLMENT_POSE_MAX_ABS_DEG
      ) {
        return {
          pass: false,
          error: "Please look directly at the camera",
          qualityError: true,
        };
      }

      return { pass: true };
    } catch (err) {
      console.error("[Rekognition] DetectFaces (enrollment gate) failed:", err);
      return {
        pass: false,
        error:
          err instanceof Error ? err.message : "Face validation failed",
        qualityError: false,
      };
    }
  }

  /**
   * Lightweight DetectFaces (default attributes) for CourtPay capture UI only.
   * Full enrollment quality (pose, confidence, etc.) still runs in enrollFace.
   */
  async detectFacePresentForCourtPayPreview(
    imageBase64: string
  ): Promise<{ faceDetected: boolean }> {
    if (USE_MOCK_SERVICE) {
      return mockFaceRecognitionService.detectFacePresentForCourtPayPreview(imageBase64);
    }

    const bytes = enrollmentImageBytes(imageBase64);
    if (bytes.length < 100) {
      return { faceDetected: false };
    }

    try {
      const response = await rekognition!.send(
        new DetectFacesCommand({
          Image: { Bytes: bytes },
        })
      );
      const n = response.FaceDetails?.length ?? 0;
      return { faceDetected: n >= 1 };
    } catch (err) {
      console.error("[Rekognition] CourtPay preview face presence:", err);
      return { faceDetected: true };
    }
  }

  /**
   * One-time startup check: verify configured collection exists, create if missing.
   * Never throws — app can still boot and fail only on actual Rekognition calls.
   */
  async verifyCollectionExistsOnStartup(): Promise<void> {
    if (USE_MOCK_SERVICE || !rekognition) return;
    try {
      let nextToken: string | undefined;
      let found = false;
      do {
        const listRes = await rekognition.send(
          new ListCollectionsCommand({ NextToken: nextToken, MaxResults: 100 })
        );
        if ((listRes.CollectionIds ?? []).includes(COLLECTION_ID)) {
          found = true;
          break;
        }
        nextToken = listRes.NextToken;
      } while (nextToken);

      if (found) {
        console.log(`[FaceRecognition] Collection verified: ${COLLECTION_ID}`);
      } else {
        console.warn(
          `[FaceRecognition] Collection not found, creating: ${COLLECTION_ID}`
        );
        await this.ensureCollection();
      }
    } catch (err) {
      console.warn("[FaceRecognition] Could not verify collection:", err);
    }
  }

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

    const quality = await this.assertEnrollmentPhotoQuality(imageBase64);
    if (!quality.pass) {
      return {
        success: false,
        error: quality.error,
        qualityError: quality.qualityError,
      };
    }

    try {
      await this.ensureCollection();

      const response = await rekognition!.send(
        new IndexFacesCommand({
          CollectionId: COLLECTION_ID,
          Image: { Bytes: enrollmentImageBytes(imageBase64) },
          ExternalImageId: `player_${playerId}`,
          MaxFaces: 1,
          QualityFilter: "AUTO",
          DetectionAttributes: [],
        })
      );

      const faceRecord = response.FaceRecords?.[0]?.Face;
      console.log("[Rekognition] IndexFaces response:", {
        faceId: faceRecord?.FaceId,
        externalImageId: faceRecord?.ExternalImageId,
        confidence: faceRecord?.Confidence,
      });
      if (!faceRecord?.FaceId) {
        return {
          success: false,
          error: "No face detected in enrollment image",
          qualityError: true,
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
  async recognizeFace(
    imageBase64: string,
    options?: RecognizeFaceOptions
  ): Promise<FaceRecognitionResult> {
    const dbg = options?.debug === true;

    if (USE_MOCK_SERVICE) {
      if (imageBase64 === "test_image_no_camera") {
        const r = await mockFaceRecognitionService.recognizeTestImage();
        const out = dbg
          ? {
              ...r,
              recognitionDebug: {
                mode: "MOCK" as const,
                awsQueried: false,
                interpretation: "mock_test_image_path",
              },
            }
          : r;
        return appendMockAttemptLog(out, options);
      }
      const r = await mockFaceRecognitionService.recognizeFace(imageBase64);
      const out = dbg
        ? {
            ...r,
            recognitionDebug: {
              mode: "MOCK" as const,
              awsQueried: false,
              interpretation:
                "mock_service — SearchFacesByImage not called; use real AWS credentials for kiosk matching",
            },
          }
        : r;
      return appendMockAttemptLog(out, options);
    }

    try {
      await this.ensureCollection();

      const imageBytes = base64ToBytes(imageBase64);

      // Allow up to 3 retries to skip orphaned faces (AWS face exists but player deleted from DB)
      const MAX_ORPHAN_RETRIES = 3;
      const orphanFaceIdsToSkip: string[] = [];

      for (let attempt = 0; attempt <= MAX_ORPHAN_RETRIES; attempt++) {
        const response = await rekognition!.send(
          new SearchFacesByImageCommand({
            CollectionId: COLLECTION_ID,
            Image: { Bytes: imageBytes },
            MaxFaces: 5,
            FaceMatchThreshold: FACE_MATCH_THRESHOLD,
            QualityFilter: "AUTO",
          })
        );

        const allMatches = response.FaceMatches ?? [];
        const topRawSimilarity = allMatches[0]?.Similarity ?? null;

        const candidates =
          orphanFaceIdsToSkip.length > 0
            ? allMatches.filter(
                (m) =>
                  !orphanFaceIdsToSkip.includes(m.Face?.FaceId ?? "")
              )
            : allMatches;

        console.log(
          "[Rekognition][FaceRecognitionAttempt]",
          JSON.stringify({
            timestamp: new Date().toISOString(),
            rekognitionOperation: "SearchFacesByImage",
            phase: "search_iteration",
            venueId: options?.venueId ?? null,
            staffId: options?.staffId ?? null,
            collectionId: COLLECTION_ID,
            similarityScore: topRawSimilarity,
            threshold: FACE_MATCH_THRESHOLD,
            passedThreshold:
              topRawSimilarity != null &&
              topRawSimilarity >= FACE_MATCH_THRESHOLD,
            orphanRetryAttempt: attempt,
            orphansSkippedCount: orphanFaceIdsToSkip.length,
            rawMatchCount: allMatches.length,
            candidateCountAfterOrphanFilter: candidates.length,
            mode: "AWS",
          })
        );

        const topDbg = candidates[0]
          ? {
              similarity: candidates[0].Similarity,
              externalImageId: candidates[0].Face?.ExternalImageId,
              faceId: candidates[0].Face?.FaceId,
            }
          : allMatches[0]
            ? {
                similarity: allMatches[0].Similarity,
                externalImageId: allMatches[0].Face?.ExternalImageId,
                faceId: allMatches[0].Face?.FaceId,
              }
            : null;

        if (candidates.length === 0) {
          queueFaceRecognitionRow({
            venueId: options?.venueId,
            staffId: options?.staffId,
            playerId: null,
            similarityScore: topRawSimilarity ?? 0,
            passed: false,
          });
          return finalizeAwsRecognition(
            {
              success: true,
              resultType: "new_player",
              ...(dbg && {
                recognitionDebug: {
                  mode: "AWS",
                  collectionId: COLLECTION_ID,
                  awsQueried: true,
                  faceMatchCount: 0,
                  topMatch: topDbg,
                  interpretation:
                    orphanFaceIdsToSkip.length > 0
                      ? `No matches after removing ${orphanFaceIdsToSkip.length} orphaned face(s) — needs_registration`
                      : `No FaceMatch at or above ${FACE_MATCH_THRESHOLD}% in collection — kiosk returns needs_registration (register on Check-in tab first)`,
                },
              }),
            },
            topRawSimilarity,
            options,
            { orphanRetryAttempt: attempt }
          );
        }

        const bestMatch = candidates[0];
        const confidence = bestMatch.Similarity ?? 0;
        const externalImageId = bestMatch.Face?.ExternalImageId ?? "";
        const matchedFaceId = bestMatch.Face?.FaceId ?? "";
        const playerId = externalImageId.replace(/^player_/, "");

        const player = await prisma.player.findUnique({
          where: { id: playerId },
        });

        if (!player) {
          queueFaceRecognitionRow({
            venueId: options?.venueId,
            staffId: options?.staffId,
            playerId: null,
            similarityScore: topRawSimilarity ?? 0,
            passed: false,
          });
          console.warn(
            `[Rekognition] Orphan face detected: faceId=${matchedFaceId} externalImageId=${externalImageId} — deleting from AWS and retrying`
          );
          orphanFaceIdsToSkip.push(matchedFaceId);
          if (matchedFaceId) {
            rekognition!
              .send(
                new DeleteFacesCommand({
                  CollectionId: COLLECTION_ID,
                  FaceIds: [matchedFaceId],
                })
              )
              .then(() =>
                console.log(`[Rekognition] Orphan face ${matchedFaceId} deleted`)
              )
              .catch((e: unknown) =>
                console.error(`[Rekognition] Failed to delete orphan face:`, e)
              );
          }
          continue;
        }

        console.log(
          `[Rekognition] Matched player ${player.name} with ${confidence.toFixed(1)}% confidence`
        );

        queueFaceRecognitionRow({
          venueId: options?.venueId,
          staffId: options?.staffId,
          playerId,
          similarityScore: topRawSimilarity ?? 0,
          passed: true,
        });

        return finalizeAwsRecognition(
          {
            success: true,
            resultType: "matched",
            playerId,
            displayName: player.name,
            confidence,
            ...(dbg && {
              recognitionDebug: {
                mode: "AWS",
                collectionId: COLLECTION_ID,
                awsQueried: true,
                faceMatchCount: candidates.length,
                topMatch: topDbg,
                externalPlayerIdFromAws: playerId,
                dbPlayerFound: true,
                dbPlayerName: player.name,
                interpretation:
                  orphanFaceIdsToSkip.length > 0
                    ? `Matched after skipping ${orphanFaceIdsToSkip.length} orphaned face(s)`
                    : "Matched AWS indexed face to DB player — kiosk should check in automatically",
              },
            }),
          },
          topRawSimilarity,
          options,
          {
            matchedPlayerId: playerId,
            orphanRetryAttempt: attempt,
          }
        );
      }

      return finalizeAwsRecognition(
        {
          success: true,
          resultType: "new_player",
          ...(dbg && {
            recognitionDebug: {
              mode: "AWS",
              collectionId: COLLECTION_ID,
              awsQueried: true,
              faceMatchCount: 0,
              topMatch: null,
              interpretation: `All ${orphanFaceIdsToSkip.length} matches were orphaned faces (deleted from DB) — cleaned from AWS`,
            },
          }),
        },
        null,
        options,
        { exhaustedOrphanRetries: true }
      );
    } catch (err: any) {
      // InvalidParameterException = no face in image
      if (
        err?.name === "InvalidParameterException" &&
        err?.message?.includes("no faces")
      ) {
        queueFaceRecognitionRow({
          venueId: options?.venueId,
          staffId: options?.staffId,
          playerId: null,
          similarityScore: 0,
          passed: false,
        });
        return finalizeAwsRecognition(
          {
            success: true,
            resultType: "new_player",
            ...(dbg && {
              recognitionDebug: {
                mode: "AWS",
                collectionId: COLLECTION_ID,
                awsQueried: true,
                faceMatchCount: 0,
                topMatch: null,
                interpretation:
                  "Rekognition: no face detected in image (InvalidParameterException) — flow uses new_player",
              },
            }),
          },
          null,
          options,
          { rekognitionError: "no_face_in_image" }
        );
      }

      console.error("[Rekognition] Recognition failed:", err);
      queueFaceRecognitionRow({
        venueId: options?.venueId,
        staffId: options?.staffId,
        playerId: null,
        similarityScore: 0,
        passed: false,
      });
      return finalizeAwsRecognition(
        {
          success: false,
          resultType: "error",
          error: err instanceof Error ? err.message : "Unknown recognition error",
          ...(dbg && {
            recognitionDebug: {
              mode: "AWS",
              awsQueried: true,
              interpretation: `Rekognition error: ${err instanceof Error ? err.message : String(err)}`,
            },
          }),
        },
        null,
        options,
        {
          rekognitionError:
            err instanceof Error ? err.message : String(err),
        }
      );
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
    } catch (err: any) {
      if (
        err?.__type === "ResourceNotFoundException" ||
        err?.name === "ResourceNotFoundException" ||
        err?.Code === "ResourceNotFoundException"
      ) {
        console.warn(
          "[FaceRecognition] Collection not found during removeFace, treating as success"
        );
        return true;
      }
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

  /** True if this player already has a non–left queue row for this session (not time-based). */
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

    return ["waiting", "assigned", "playing", "on_break"]
      .includes(entry.status);
  }

  getStats() {
    if (USE_MOCK_SERVICE) return mockFaceRecognitionService.getStats();
    return { enrolledPlayers: 0, isMock: false };
  }
}

export const faceRecognitionService = new FaceRecognitionService();
void faceRecognitionService.verifyCollectionExistsOnStartup();
