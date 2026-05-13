import { prisma } from "@/lib/db";

/**
 * Enqueue a sticker generation job for a newly registered female player.
 * Safe to call fire-and-forget — never throws, just logs on error.
 *
 * Skips if:
 * - player is not female
 * - player already has a sticker pack
 * - player already has a pending or processing job
 */
export async function enqueueStickerJobIfNeeded(
  playerId: string,
  gender: string
): Promise<void> {
  if (gender !== "female") return;

  const [existingPack, existingJob] = await Promise.all([
    prisma.playerStickerPack.findFirst({ where: { playerId } }),
    prisma.stickerJobQueue.findFirst({
      where: { playerId, status: { in: ["pending", "processing"] } },
    }),
  ]);

  if (existingPack || existingJob) return;

  await prisma.stickerJobQueue.create({ data: { playerId } });
  console.log(`[sticker-queue] enqueued job for player ${playerId}`);
}
