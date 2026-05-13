import { after } from "next/server";
import { prisma } from "@/lib/db";
import { processStickerQueue } from "@/lib/sticker-job-processor";

/**
 * Enqueue a sticker generation job for a newly registered player.
 * Safe to call fire-and-forget — never throws, just logs on error.
 *
 * Skips if:
 * - player is not male or female
 * - player already has a sticker pack
 * - player already has a pending or processing job
 */
export async function enqueueStickerJobIfNeeded(
  playerId: string,
  gender: string
): Promise<void> {
  if (gender !== "female" && gender !== "male") return;

  const [existingPack, existingJob] = await Promise.all([
    prisma.playerStickerPack.findFirst({ where: { playerId } }),
    prisma.stickerJobQueue.findFirst({
      where: { playerId, status: { in: ["pending", "processing"] } },
    }),
  ]);

  if (existingPack || existingJob) return;

  await prisma.stickerJobQueue.create({ data: { playerId } });
  console.log(`[sticker-queue] enqueued job for player ${playerId} (${gender})`);

  // Kick off the worker immediately after the current response is sent.
  // The processor has a concurrency guard — only one job runs at a time.
  // If another job is already running this exits instantly; the new job
  // will be picked up when that job finishes and triggers the next call.
  after(() => {
    processStickerQueue().catch((e: Error) =>
      console.error("[sticker-queue] after() processor error:", e.message)
    );
  });
}
