import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);

    if (!venueId?.trim()) {
      return error("venueId is required", 400);
    }

    // Get active session
    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });

    if (!session) {
      return json({ success: true, checkins: [] });
    }

    // Get recent face check-ins
    const recentCheckins = await prisma.faceAttempt.findMany({
      where: {
        eventId: session.id,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        },
      },
      include: {
        matchedPlayer: {
          select: {
            id: true,
            name: true,
            gender: true,
            skillLevel: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    const checkins = recentCheckins.map((attempt) => ({
      id: attempt.id,
      timestamp: attempt.createdAt,
      resultType: attempt.resultType,
      confidence: attempt.confidence,
      queueNumberAssigned: attempt.queueNumberAssigned,
      createdNewPlayer: attempt.createdNewPlayer,
      hostReviewed: attempt.hostReviewed,
      player: attempt.matchedPlayer,
    }));

    return json({
      success: true,
      checkins,
    });
  } catch (e) {
    console.error("[Kiosk Recent Check-ins] Error:", e);
    return error((e as Error).message, 500);
  }
}
