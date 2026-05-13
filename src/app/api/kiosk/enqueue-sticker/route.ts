import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { enqueueStickerJobIfNeeded } from "@/lib/sticker-queue";

export const dynamic = "force-dynamic";

function validateKioskSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-kiosk-secret");
  return !!secret && secret === process.env.STICKER_KIOSK_SECRET;
}

/**
 * POST /api/kiosk/enqueue-sticker
 * Body: { playerId: string }
 *
 * Enqueues a sticker generation job for the given player if they don't already
 * have one. Called from the kiosk "I want to buy" button when the player has
 * no sticker pack yet.
 */
export async function POST(request: NextRequest) {
  if (!validateKioskSecret(request)) {
    return error("Unauthorized", 401);
  }

  const body = await request.json() as { playerId?: string };
  const { playerId } = body;

  if (!playerId) {
    return error("playerId is required", 400);
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, gender: true },
  });

  if (!player) {
    return error("Player not found", 404);
  }

  await enqueueStickerJobIfNeeded(player.id, player.gender);

  console.log(`[kiosk/enqueue-sticker] job enqueued for player ${playerId} (gender: ${player.gender})`);
  return json({ queued: true });
}
