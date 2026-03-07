import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = requireAuth(request.headers);
    const { sessionId } = await params;
    const body = await parseBody<{
      experience: number;
      matchQuality: string;
      wouldReturn: string;
    }>(request);

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return error("Session not found", 404);

    await prisma.auditLog.create({
      data: {
        venueId: session.venueId,
        action: "player_feedback",
        targetId: auth.id,
        metadata: {
          sessionId,
          experience: body.experience,
          matchQuality: body.matchQuality,
          wouldReturn: body.wouldReturn,
        },
      },
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
