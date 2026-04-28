const envSuffix = process.env.NODE_ENV === "production" ? "prod" : "staging";

export const COLLECTION_ID =
  process.env.AWS_REKOGNITION_COLLECTION ||
  `courtflow-players-${envSuffix}`;

/**
 * Production cutoff for SearchFacesByImage — matches below this are ignored for player lookup.
 * Override with AWS_REKOGNITION_FACE_MATCH_THRESHOLD (1–100).
 */
export const FACE_MATCH_THRESHOLD = (() => {
  const raw = process.env.AWS_REKOGNITION_FACE_MATCH_THRESHOLD;
  const n = raw != null && raw !== "" ? Number(raw) : 85;
  return Number.isFinite(n) && n >= 1 && n <= 100 ? n : 85;
})();
