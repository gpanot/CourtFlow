import { NextRequest, NextResponse } from "next/server";
import { compareTwoFaceImagesDiagnostic } from "@/lib/rekognition-compare";
import { FACE_MATCH_THRESHOLD } from "@/lib/rekognition-config";
import { requireSuperAdmin } from "@/lib/auth";

function stripDataUrl(b64: string): string {
  const t = b64.trim();
  if (t.includes(",")) return t.split(",").pop() ?? t;
  return t;
}

function allowDiagnose(headers: Headers): boolean {
  if (process.env.NODE_ENV === "development") return true;
  try {
    requireSuperAdmin(headers);
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/rekognition/diagnose
 * Internal only: CompareFaces between two images (not collection search).
 */
export async function POST(req: NextRequest) {
  if (!allowDiagnose(req.headers)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const imageBase64A =
      typeof body.imageBase64A === "string" ? body.imageBase64A : "";
    const imageBase64B =
      typeof body.imageBase64B === "string" ? body.imageBase64B : "";

    if (!imageBase64A.trim() || !imageBase64B.trim()) {
      return NextResponse.json(
        { error: "imageBase64A and imageBase64B are required" },
        { status: 400 }
      );
    }

    const a = stripDataUrl(imageBase64A);
    const b = stripDataUrl(imageBase64B);

    const diag = await compareTwoFaceImagesDiagnostic(a, b);

    const similarity = diag.similarity;
    const passedProduction =
      similarity != null && similarity >= FACE_MATCH_THRESHOLD;

    return NextResponse.json({
      similarity,
      productionThreshold: FACE_MATCH_THRESHOLD,
      passedProduction,
      compareFaces: diag,
      confidenceBreakdown: {
        sourceFaceConfidence: diag.sourceFaceConfidence,
        targetFacesDetected: diag.targetFacesDetected,
        unmatchedFacesInTarget: diag.unmatchedFacesInTarget,
        compareThresholdUsed: diag.compareThresholdUsed,
        notes: diag.notes,
      },
    });
  } catch (e) {
    console.error("[rekognition/diagnose]", e);
    const msg = e instanceof Error ? e.message : "CompareFaces failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
