import { NextRequest } from "next/server";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { enqueueStickerJobIfNeeded } from "@/lib/sticker-queue";
import { processStickerQueue } from "@/lib/sticker-job-processor";

export const dynamic = "force-dynamic";
// Allow 5 min — the after() background task runs gpt-image-2 which can take ~2-7 min
export const maxDuration = 300;

function validateKioskSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-kiosk-secret");
  return !!secret && secret === process.env.STICKER_KIOSK_SECRET;
}

/**
 * POST /api/kiosk/enqueue-sticker
 * Body: { playerId: string }
 *
 * 1. Enqueues a sticker generation job for the player (if not already queued).
 * 2. Returns immediately to the kiosk (non-blocking).
 * 3. After the response is sent, fires processStickerQueue() in the background.
 *    The processor has a concurrency guard — if another job is already running
 *    it exits immediately and the new job will be picked up on the next trigger.
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
    select: { id: true, gender: true, name: true },
  });

  if (!player) {
    return error("Player not found", 404);
  }

  await enqueueStickerJobIfNeeded(player.id, player.gender);
  console.log(`[kiosk/enqueue-sticker] job enqueued for player ${playerId} (${player.name}, gender: ${player.gender})`);

  // Fire the worker AFTER the response is sent — non-blocking for the kiosk
  after(async () => {
    console.log(`[kiosk/enqueue-sticker] after() — starting processor for player ${playerId}`);
    const result = await processStickerQueue().catch((e: Error) => {
      console.error("[kiosk/enqueue-sticker] after() processor error:", e.message);
      return null;
    });
    console.log(`[kiosk/enqueue-sticker] after() — processor result:`, JSON.stringify(result));
  });

  return json({ queued: true });
}
