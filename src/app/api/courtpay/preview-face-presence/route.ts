import { NextResponse } from "next/server";
import { faceRecognitionService } from "@/lib/face-recognition";
import { blurBackground } from "@/lib/fapihub";

export const dynamic = "force-dynamic";
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

    console.info("[courtpay/preview-face-presence] aws_preview_check_start", {
      trigger: trigger ?? null,
      blurRequested: blurBackgroundRequested,
      imageBytes: Buffer.byteLength(imageBase64, "base64"),
    });
    const { faceDetected, boundingBox } =
      await faceRecognitionService.detectFacePresentForCourtPayPreview(imageBase64);
    console.info("[courtpay/preview-face-presence] aws_preview_check_result", {
      trigger: trigger ?? null,
      faceDetected,
      hasBoundingBox: !!boundingBox,
    });

    let processedImageBase64: string | undefined;
    let blurApplied = false;
    let blurReason = "not_requested_or_no_face";
    if (blurBackgroundRequested && faceDetected) {
      try {
        console.info("[courtpay/preview-face-presence] blur_call_start", {
          trigger: trigger ?? null,
        });
        processedImageBase64 = await blurBackground(imageBase64);
        blurApplied = true;
        blurReason = "fapihub_success";
        console.info("[courtpay/preview-face-presence] blur_call_success", {
          trigger: trigger ?? null,
          processedBytes: processedImageBase64
            ? Buffer.byteLength(processedImageBase64, "base64")
            : null,
        });
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
