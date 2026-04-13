import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { analyzeFaceQuality } from "@/lib/face-quality";

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<{
      imageBase64: string;
    }>(request);

    const { imageBase64 } = body;
    
    if (!imageBase64?.trim()) return error("Image is required", 400);

    // Analyze face quality
    const qualityAnalysis = await analyzeFaceQuality(imageBase64);

    return json({
      success: true,
      qualityCheck: qualityAnalysis,
    }, 200);
  } catch (e) {
    console.error("[Face Quality Analysis] Error:", e);
    return error((e as Error).message, 500);
  }
}
