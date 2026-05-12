import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { token?: string };
    const { token } = body;

    if (!token) {
      return error("token is required", 400);
    }

    const session = await prisma.stickerSession.findUnique({
      where: { token },
    });

    if (!session) {
      return json({ error: "not_found" }, 404);
    }

    if (session.expiresAt < new Date()) {
      return json({ error: "expired" }, 401);
    }

    // Mark the most recent sticker pack for this player as paid
    const pack = await prisma.playerStickerPack.findFirst({
      where: { playerId: session.playerId },
      orderBy: { createdAt: "desc" },
    });

    if (!pack) {
      return json({ error: "no_pack" }, 404);
    }

    await prisma.playerStickerPack.update({
      where: { id: pack.id },
      data: { isPaid: true, paidAt: new Date() },
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
