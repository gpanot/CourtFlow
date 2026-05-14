import { NextRequest, after } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
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

  // Direct enqueue — bypasses the female-only guard in enqueueStickerJobIfNeeded
  // because the player explicitly tapped "I want to buy", regardless of gender.
  const [existingPack, existingJob] = await Promise.all([
    prisma.playerStickerPack.findFirst({ where: { playerId: player.id } }),
    prisma.stickerJobQueue.findFirst({
      where: { playerId: player.id, status: { in: ["pending", "processing"] } },
    }),
  ]);

  if (existingPack) {
    console.log(`[kiosk/enqueue-sticker] player ${player.name} already has a sticker pack — skipping`);
    return json({ queued: false, reason: "already_has_pack" });
  }

  if (!existingJob) {
    await prisma.stickerJobQueue.create({ data: { playerId: player.id } });
    console.log(`[kiosk/enqueue-sticker] job created for player ${playerId} (${player.name}, gender: ${player.gender})`);
  } else {
    console.log(`[kiosk/enqueue-sticker] job already pending/processing for player ${player.name} — skipping duplicate`);
  }

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
