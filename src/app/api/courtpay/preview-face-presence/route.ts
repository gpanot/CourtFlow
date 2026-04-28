import { NextResponse } from "next/server";
import { faceRecognitionService } from "@/lib/face-recognition";

/**
 * POST /api/courtpay/preview-face-presence
 *
 * Returns whether Rekognition sees at least one face (default DetectFaces).
 * Optional request body flag `returnBoundingBox: true` includes best-face bounding box.
 * Used for CourtPay capture feedback only; enrollFace still runs the full quality gate.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const imageBase64 = body?.imageBase64 as string | undefined;
    const returnBoundingBox = body?.returnBoundingBox === true;
    if (!imageBase64?.trim()) {
      return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
    }

    const { faceDetected, boundingBox } =
      await faceRecognitionService.detectFacePresentForCourtPayPreview(imageBase64);
    return NextResponse.json({
      faceDetected,
      ...(returnBoundingBox && boundingBox ? { boundingBox } : {}),
    });
  } catch (err) {
    console.error("[courtpay/preview-face-presence]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
