/**
 * Core sticker generation worker logic.
 * Picks the oldest pending job from sticker_job_queue and processes it.
 * Concurrency = 1: exits immediately if another job is already processing.
 *
 * Call this from:
 *   - POST /api/kiosk/enqueue-sticker (via after() — fires after response)
 *   - POST /api/internal/process-sticker-queue (manual/admin trigger)
 */

import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { generateHowToCard } from "@/lib/generate-howto-card";

const STICKER_RESULTS_DIR = path.join(process.cwd(), "uploads", "players", "sticker-results");
const PACKS_DIR = path.join(process.cwd(), "uploads", "players", "sticker-packs");

const QUADRANTS = [
  { index: 1, left: 0, top: 0 },
  { index: 2, left: 512, top: 0 },
  { index: 3, left: 0, top: 512 },
  { index: 4, left: 512, top: 512 },
];

const STUCK_JOB_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 3;

export type ProcessResult =
  | { status: "done"; jobId: string; packId: string; playerId: string }
  | { status: "busy"; jobId: string }
  | { status: "idle" }
  | { status: "skipped"; reason: string }
  | { status: "error"; jobId: string; error: string };

export async function processStickerQueue(): Promise<ProcessResult> {
  // ── 1. Recover stuck jobs ─────────────────────────────────────────────
  const stuckCutoff = new Date(Date.now() - STUCK_JOB_THRESHOLD_MS);
  const recovered = await prisma.stickerJobQueue.updateMany({
    where: { status: "processing", updatedAt: { lt: stuckCutoff } },
    data: { status: "pending" },
  });
  if (recovered.count > 0) {
    console.log(`[sticker-queue-worker] recovered ${recovered.count} stuck job(s)`);
  }

  // ── 2. Bail out if another job is already processing ─────────────────
  const inFlight = await prisma.stickerJobQueue.findFirst({
    where: { status: "processing" },
    select: { id: true },
  });
  if (inFlight) {
    console.log(`[sticker-queue-worker] busy — job ${inFlight.id} already in flight`);
    return { status: "busy", jobId: inFlight.id };
  }

  // ── 3. Pick the oldest pending job ───────────────────────────────────
  const job = await prisma.stickerJobQueue.findFirst({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    include: { player: true },
  });
  if (!job) {
    console.log("[sticker-queue-worker] no pending jobs");
    return { status: "idle" };
  }

  // Mark as processing
  await prisma.stickerJobQueue.update({
    where: { id: job.id },
    data: { status: "processing", attempts: { increment: 1 } },
  });

  const player = job.player;
  console.log(`[sticker-queue-worker] START job=${job.id} player=${player.id} (${player.name}) gender=${player.gender}`);

  try {
    // ── 4. Verify prerequisites ─────────────────────────────────────────
    if (!player.facePhotoPath) {
      throw new Error("Player has no face photo yet — will retry when face is enrolled");
    }

    const existingPack = await prisma.playerStickerPack.findFirst({ where: { playerId: player.id } });
    if (existingPack) {
      await prisma.stickerJobQueue.update({ where: { id: job.id }, data: { status: "done" } });
      console.log(`[sticker-queue-worker] player ${player.id} already has a pack — skipped`);
      return { status: "skipped", reason: "already_has_pack" };
    }

    // ── 5. Fetch Pickleball template prompt for this gender ─────────────
    const template = await prisma.stickerTemplate.findFirst({ where: { name: "Pickleball" } });
    if (!template) throw new Error("Pickleball template not found in database");
    const prompt = player.gender === "male" ? template.malePrompt : template.femalePrompt;
    console.log(`[sticker-queue-worker] using ${player.gender === "male" ? "male" : "female"} prompt`);

    // ── 6. Resolve face photo path ──────────────────────────────────────
    const urlPath = player.facePhotoPath.split("?")[0];
    const imageAbsPath = path.join(process.cwd(), urlPath);

    // ── 7. WaveSpeed / gpt-image-2 generation ──────────────────────────
    if (!process.env.WAVESPEED_API_KEY) throw new Error("WAVESPEED_API_KEY is not set");

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const WaveSpeed = require("wavespeed");
    const client = new WaveSpeed.Client();

    const isPubliclyReachable = !!process.env.RAILWAY_PUBLIC_DOMAIN;
    let imageInput: string;
    if (isPubliclyReachable) {
      const appUrl = process.env.APP_URL ?? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
      imageInput = `${appUrl}${imageAbsPath.replace(process.cwd(), "").replace(/\\/g, "/")}`;
    } else {
      const imageBytes = await readFile(imageAbsPath);
      const ext = path.extname(imageAbsPath).slice(1).toLowerCase() || "jpeg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      imageInput = `data:${mime};base64,${imageBytes.toString("base64")}`;
    }

    const startTime = Date.now();
    console.log(`[sticker-queue-worker] calling WaveSpeed gpt-image-2 for player ${player.id}...`);

    const result = await client.run("openai/gpt-image-2/edit", {
      background: "opaque",
      enable_base64_output: false,
      enable_sync_mode: false,
      images: [imageInput],
      input_fidelity: "high",
      output_format: "png",
      prompt: prompt.trim(),
      quality: "medium",
      size: "1024*1024",
    });

    const elapsed = (Date.now() - startTime) / 1000;
    const outputUrl = result.outputs[0];
    if (!outputUrl) throw new Error("WaveSpeed returned no output URL");

    console.log(`[sticker-queue-worker] WaveSpeed done in ${elapsed.toFixed(1)}s — downloading...`);
    const imgRes = await fetch(outputUrl);
    if (!imgRes.ok) throw new Error(`Failed to download image from WaveSpeed: HTTP ${imgRes.status}`);
    const imageData = Buffer.from(await imgRes.arrayBuffer());

    await mkdir(STICKER_RESULTS_DIR, { recursive: true });
    const filename = `${player.id}_result_${Date.now()}.png`;
    const filePath = path.join(STICKER_RESULTS_DIR, filename);
    await writeFile(filePath, imageData);
    const imageUrl = `/uploads/players/sticker-results/${filename}`;

    const saved = await prisma.playerStickerResult.create({
      data: {
        playerId: player.id,
        imageUrl,
        prompt: prompt.trim(),
        model: "gpt-image-2",
        size: "1024x1024",
        costUsd: 0.07,
        generationTimeSeconds: Math.round(elapsed * 10) / 10,
      },
    });

    console.log(`[sticker-queue-worker] result saved: ${saved.id} — splitting into stickers...`);

    // ── 8. Split + background removal ──────────────────────────────────
    const metadata = await sharp(filePath).metadata();
    const imgW = metadata.width ?? 1024;
    const imgH = metadata.height ?? 1024;
    const quadW = Math.floor(imgW / 2);
    const quadH = Math.floor(imgH / 2);

    const outputDir = path.join(PACKS_DIR, player.id);
    const ts = Date.now();
    const packSubDir = path.join(outputDir, String(ts));
    await mkdir(packSubDir, { recursive: true });

    const fastapiUrl = (process.env["FASTAPI_URL"] ?? "http://localhost:8000").replace(/\/$/, "");
    const stickerUrls: Record<string, string> = {};

    // Fetch current chroma settings from DB (falls back to current defaults if not set)
    const kioskSettings = await prisma.kioskSettings.findUnique({ where: { id: "global" } });
    const chromaTolerance = kioskSettings?.chromaTolerance ?? 65;
    const featherRadius = kioskSettings?.featherRadius ?? 0.8;

    for (const q of QUADRANTS) {
      const cropLeft = q.left === 0 ? 0 : quadW;
      const cropTop = q.top === 0 ? 0 : quadH;
      const cropped = await sharp(filePath)
        .extract({ left: cropLeft, top: cropTop, width: quadW, height: quadH })
        .png()
        .toBuffer();

      const base64 = cropped.toString("base64");
      const res = await fetch(`${fastapiUrl}/internal/remove-background`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_base64: base64, aggressiveness: "chroma", chroma_tolerance: chromaTolerance, feather_radius: featherRadius }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Background removal failed for sticker ${q.index}: ${text}`);
      }

      const processed = Buffer.from(await res.arrayBuffer());
      const webpBuffer = await sharp(processed)
        .trim()
        .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90 })
        .toBuffer();

      const stickerFilename = `sticker_${q.index}.webp`;
      await writeFile(path.join(packSubDir, stickerFilename), webpBuffer);
      stickerUrls[`sticker${q.index}Url`] = `/uploads/players/sticker-packs/${player.id}/${ts}/${stickerFilename}?t=${ts}`;
      console.log(`[sticker-queue-worker] sticker ${q.index}/4 done`);
    }

    // ── 9. Generate how-to card ─────────────────────────────────────────
    let howToCardUrl: string | null = null;
    try {
      const cardBuffer = await generateHowToCard();
      await writeFile(path.join(packSubDir, "how-to-use.png"), cardBuffer);
      howToCardUrl = `/uploads/players/sticker-packs/${player.id}/${ts}/how-to-use.png?t=${ts}`;
    } catch (cardErr) {
      console.warn("[sticker-queue-worker] how-to card generation failed (non-fatal):", cardErr);
    }

    // ── 10. Create sticker pack + mark done ─────────────────────────────
    const pack = await prisma.playerStickerPack.create({
      data: {
        playerId: player.id,
        resultId: saved.id,
        sticker1Url: stickerUrls["sticker1Url"],
        sticker2Url: stickerUrls["sticker2Url"],
        sticker3Url: stickerUrls["sticker3Url"],
        sticker4Url: stickerUrls["sticker4Url"],
        howToCardUrl,
      },
    });

    await prisma.stickerJobQueue.update({
      where: { id: job.id },
      data: { status: "done" },
    });

    console.log(`[sticker-queue-worker] DONE job=${job.id} pack=${pack.id} player=${player.id} (${player.name})`);
    return { status: "done", jobId: job.id, packId: pack.id, playerId: player.id };

  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    console.error(`[sticker-queue-worker] FAILED job=${job.id}:`, msg);

    const currentJob = await prisma.stickerJobQueue.findUnique({
      where: { id: job.id },
      select: { attempts: true },
    });
    const attempts = currentJob?.attempts ?? job.attempts + 1;

    if (attempts < MAX_ATTEMPTS) {
      await prisma.stickerJobQueue.update({
        where: { id: job.id },
        data: { status: "pending", error: msg },
      });
      console.log(`[sticker-queue-worker] will retry job=${job.id} (attempt ${attempts}/${MAX_ATTEMPTS})`);
    } else {
      await prisma.stickerJobQueue.update({
        where: { id: job.id },
        data: { status: "failed", error: msg },
      });
      console.log(`[sticker-queue-worker] permanently failed job=${job.id} after ${attempts} attempts`);
    }

    return { status: "error", jobId: job.id, error: msg };
  }
}
