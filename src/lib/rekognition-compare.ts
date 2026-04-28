import {
  RekognitionClient,
  CompareFacesCommand,
} from "@aws-sdk/client-rekognition";
import { FACE_MATCH_THRESHOLD } from "@/lib/rekognition-config";
import { USE_MOCK_SERVICE } from "@/lib/face-recognition";

if (process.env.NODE_ENV === "production" && USE_MOCK_SERVICE) {
  console.error(
    "[FaceRecognition] CRITICAL: Mock mode is active in production. AWS_ACCESS_KEY_ID is missing or invalid. All face enrollments and recognition calls will be fake."
  );
}

function base64ToBytes(base64: string): Uint8Array {
  const normalized = base64.includes(",") ? base64.split(",").pop() ?? base64 : base64;
  return Buffer.from(normalized, "base64");
}

export interface CompareFacesDiagnosticResult {
  similarity: number | null;
  productionThreshold: number;
  compareThresholdUsed: number;
  sourceFaceConfidence: number | null;
  targetFacesDetected: number;
  unmatchedFacesInTarget: number;
  notes?: string;
}

/**
 * Compare two face images via Rekognition CompareFaces (not used in production check-in,
 * which uses SearchFacesByImage against the collection).
 */
export async function compareTwoFaceImagesDiagnostic(
  sourceBase64: string,
  targetBase64: string
): Promise<CompareFacesDiagnosticResult> {
  if (USE_MOCK_SERVICE) {
    return {
      similarity: 87.5,
      productionThreshold: FACE_MATCH_THRESHOLD,
      compareThresholdUsed: 0,
      sourceFaceConfidence: 99.9,
      targetFacesDetected: 1,
      unmatchedFacesInTarget: 0,
      notes: "MOCK mode — set real AWS credentials for live CompareFaces scores.",
    };
  }

  const rekognition = new RekognitionClient({
    region: process.env.AWS_REGION || "ap-southeast-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const response = await rekognition.send(
    new CompareFacesCommand({
      SourceImage: { Bytes: base64ToBytes(sourceBase64) },
      TargetImage: { Bytes: base64ToBytes(targetBase64) },
      SimilarityThreshold: 0,
      QualityFilter: "AUTO",
    })
  );

  const match = response.FaceMatches?.[0];
  const similarity = match?.Similarity ?? null;

  const matchedCount = response.FaceMatches?.length ?? 0;
  const unmatchedCount = response.UnmatchedFaces?.length ?? 0;

  return {
    similarity,
    productionThreshold: FACE_MATCH_THRESHOLD,
    compareThresholdUsed: 0,
    sourceFaceConfidence: response.SourceImageFace?.Confidence ?? null,
    targetFacesDetected: matchedCount + unmatchedCount,
    unmatchedFacesInTarget: unmatchedCount,
  };
}
