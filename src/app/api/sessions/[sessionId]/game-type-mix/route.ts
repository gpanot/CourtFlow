import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { sessionId } = await params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) return error("Session not found", 404);

    const assignments = await prisma.courtAssignment.findMany({
      where: { sessionId, isWarmup: false },
      select: { gameType: true },
    });

    const played: Record<string, number> = { men: 0, women: 0, mixed: 0 };
    for (const a of assignments) {
      played[a.gameType] = (played[a.gameType] || 0) + 1;
    }

    const total = assignments.length;
    const actual = {
      men: total > 0 ? Math.round((played.men / total) * 100) : 0,
      women: total > 0 ? Math.round((played.women / total) * 100) : 0,
      mixed: total > 0 ? Math.round((played.mixed / total) * 100) : 0,
    };

    return json({
      target: session.gameTypeMix ?? null,
      actual,
      played,
      totalGames: total,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { sessionId } = await params;
    const { gameTypeMix } = await parseBody<{
      gameTypeMix: { men: number; women: number; mixed: number } | null;
    }>(request);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) return error("Session not found", 404);
    if (session.status !== "open") return error("Session is closed", 400);

    await prisma.session.update({
      where: { id: sessionId },
      data: { gameTypeMix: gameTypeMix === null ? Prisma.DbNull : gameTypeMix },
    });

    await prisma.auditLog.create({
      data: {
        venueId: session.venueId,
        staffId: auth.id,
        action: "game_type_mix_updated",
        targetId: sessionId,
        metadata: { gameTypeMix },
      },
    });

    emitToVenue(session.venueId, "session:updated", { gameTypeMix });

    return json({ success: true, gameTypeMix });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
