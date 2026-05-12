import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET /api/player/sticker-payment-status?token=<stickerToken>
 * Lightweight polling endpoint — no heavy auth, just token validation.
 * Returns { isPaid: boolean }
 */
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) return error("token is required", 400);

    const session = await prisma.stickerSession.findUnique({ where: { token } });
    if (!session) return json({ isPaid: false });
    if (session.expiresAt < new Date()) return json({ isPaid: false });

    const pack = await prisma.playerStickerPack.findFirst({
      where: { playerId: session.playerId },
      orderBy: { createdAt: "desc" },
      select: { isPaid: true },
    });

    return json({ isPaid: pack?.isPaid ?? false });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
