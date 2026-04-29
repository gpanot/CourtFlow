import { NextResponse } from "next/server";
import { faceRecognitionService } from "@/lib/face-recognition";
import { blurBackground } from "@/lib/fapihub";

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
    const blurBackgroundRequested = body?.blurBackground === true;
    const trigger =
      typeof body?.trigger === "string" && body.trigger.trim().length > 0
        ? body.trigger.trim()
        : undefined;
    if (!imageBase64?.trim()) {
      return NextResponse.json({ error: "imageBase64 is required" }, { status: 400 });
    }

    const { faceDetected, boundingBox } =
      await faceRecognitionService.detectFacePresentForCourtPayPreview(imageBase64);

    let processedImageBase64: string | undefined;
    let blurApplied = false;
    let blurReason = "not_requested_or_no_face";
    if (blurBackgroundRequested && faceDetected) {
      try {
        processedImageBase64 = await blurBackground(imageBase64);
        blurApplied = true;
        blurReason = "fapihub_success";
      } catch (err) {
        console.warn("[courtpay/preview-face-presence] FapiHub blur failed:", err);
        processedImageBase64 = imageBase64;
        blurApplied = false;
        blurReason = "fapihub_failed_fallback_original";
      }
    }

    console.info("[courtpay/preview-face-presence] blur result", {
      trigger: trigger ?? null,
      faceDetected,
      blurRequested: blurBackgroundRequested,
      blurApplied,
      blurReason,
      hasBoundingBox: !!boundingBox,
      returnedProcessedImage: !!processedImageBase64,
    });

    return NextResponse.json({
      faceDetected,
      ...(returnBoundingBox && boundingBox ? { boundingBox } : {}),
      blurRequested: blurBackgroundRequested,
      blurApplied,
      blurReason,
      ...(processedImageBase64 ? { processedImageBase64 } : {}),
    });
  } catch (err) {
    console.error("[courtpay/preview-face-presence]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
