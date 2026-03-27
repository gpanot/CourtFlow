import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";

export async function GET(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId");

    if (!venueId?.trim()) {
      return error("venueId is required", 400);
    }

    // Get active session
    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });

    if (!session) {
      return error("No active session found", 404);
    }

    // Check CompreFace health
    const comprefaceHealthy = await faceRecognitionService.checkHealth();

    return json({
      success: true,
      session: {
        id: session.id,
        venueId: session.venueId,
        status: session.status,
        warmupMode: session.warmupMode,
      },
      kiosk: {
        comprefaceHealthy,
        cooldownMs: 2000, // 2-second cooldown between attempts
        confidenceThreshold: 0.7,
      },
    });
  } catch (e) {
    console.error("[Kiosk Session] Error:", e);
    return error((e as Error).message, 500);
  }
}
