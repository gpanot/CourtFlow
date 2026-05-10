import { NextRequest } from "next/server";
import { mkdir, writeFile, unlink, readFile } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

// Allow up to 5 minutes — gpt-image-2 can take 60–120s on WaveSpeed
export const maxDuration = 300;

const STICKER_RESULTS_DIR = path.join(process.cwd(), "uploads", "players", "sticker-results");

const VALID_MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1-mini", "gpt-image-1"] as const;
type StickerModel = (typeof VALID_MODELS)[number];

const MODEL_COSTS: Record<StickerModel, number> = {
  "gpt-image-2": 0.02,
  "gpt-image-1.5": 0.008,
  "gpt-image-1-mini": 0.004,
  "gpt-image-1": 0.008,
};

if (!process.env.WAVESPEED_API_KEY) {
  console.warn("[sticker-generate] WARNING: WAVESPEED_API_KEY environment variable is not set. Sticker generation will fail.");
}

/**
 * POST: generate a sticker image using OpenAI images.edit.
 * Body: { photo_id: string, prompt: string, model?: string }
 *   photo_id can be "checkin" to use the player's facePhotoPath,
 *   or a PlayerStickerPhoto UUID for an uploaded photo.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    if (!process.env.WAVESPEED_API_KEY) {
      return error("WAVESPEED_API_KEY is not configured on this server.", 503);
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return notFound("Player not found");

    const body = await parseBody<{ photo_id?: string; prompt?: string; model?: string }>(request);
    const { photo_id, prompt } = body;
    const modelRaw = body.model ?? "gpt-image-1.5";

    if (!VALID_MODELS.includes(modelRaw as StickerModel)) {
      return error(`Invalid model "${modelRaw}". Accepted: ${VALID_MODELS.join(", ")}`, 400);
    }
    const selectedModel = modelRaw as StickerModel;
    const costUsd = MODEL_COSTS[selectedModel];

    if (!prompt?.trim()) return error("Prompt is required", 400);

    // Resolve which image to use
    let imageAbsPath: string;
    if (!photo_id || photo_id === "checkin") {
      if (!player.facePhotoPath) return error("Player has no check-in photo", 400);
      const urlPath = player.facePhotoPath.split("?")[0];
      imageAbsPath = path.join(process.cwd(), urlPath);
    } else {
      const stickerPhoto = await prisma.playerStickerPhoto.findFirst({
        where: { id: photo_id, playerId },
      });
      if (!stickerPhoto) return notFound("Sticker photo not found");
      const urlPath = stickerPhoto.imageUrl.split("?")[0];
      imageAbsPath = path.join(process.cwd(), urlPath);
    }

    const startTime = Date.now();

    let openaiResult: { imageData: Buffer; elapsed: number };
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const WaveSpeed = require("wavespeed");
      const client = new WaveSpeed.Client();

      // On production use the public URL (WaveSpeed fetches it remotely).
      // In local dev RAILWAY_PUBLIC_DOMAIN is absent and the local server isn't
      // reachable by WaveSpeed, so read the file from disk and send base64 instead.
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

      const wavespeedModel = `openai/${selectedModel}/edit`;
      const result = await client.run(wavespeedModel, {
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

      const imgRes = await fetch(outputUrl);
      if (!imgRes.ok) throw new Error(`Failed to download generated image from WaveSpeed: HTTP ${imgRes.status}`);
      const imageData = Buffer.from(await imgRes.arrayBuffer());

      openaiResult = { imageData, elapsed };
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error("[sticker-generate] WaveSpeed error:", msg);
      return json(
        { error: `Image generation failed. Check your WaveSpeed API key and quota. Details: ${msg}` },
        502
      );
    }

    // Save the generated image to disk
    await mkdir(STICKER_RESULTS_DIR, { recursive: true });
    const filename = `${playerId}_result.png`;
    const filePath = path.join(STICKER_RESULTS_DIR, filename);
    await writeFile(filePath, openaiResult.imageData);
    const imageUrl = `/uploads/players/sticker-results/${filename}?t=${Date.now()}`;

    // Delete old result file if different filename (same here but for safety)
    const existingResult = await prisma.playerStickerResult.findUnique({ where: { playerId } });
    if (existingResult) {
      const oldPath = existingResult.imageUrl.split("?")[0];
      if (oldPath !== `/uploads/players/sticker-results/${filename}`) {
        try { await unlink(path.join(process.cwd(), oldPath)); } catch { /* ignore */ }
      }
    }

    const saved = await prisma.playerStickerResult.upsert({
      where: { playerId },
      create: {
        playerId,
        imageUrl,
        prompt: prompt.trim(),
        model: selectedModel,
        size: "1024x1024",
        costUsd,
        generationTimeSeconds: Math.round(openaiResult.elapsed * 10) / 10,
      },
      update: {
        imageUrl,
        prompt: prompt.trim(),
        model: selectedModel,
        costUsd,
        generationTimeSeconds: Math.round(openaiResult.elapsed * 10) / 10,
        updatedAt: new Date(),
      },
    });

    return json({
      imageUrl: saved.imageUrl,
      model: saved.model,
      size: saved.size,
      costUsd: Number(saved.costUsd),
      generationTimeSeconds: saved.generationTimeSeconds ? Number(saved.generationTimeSeconds) : openaiResult.elapsed,
      createdAt: saved.createdAt.toISOString(),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
