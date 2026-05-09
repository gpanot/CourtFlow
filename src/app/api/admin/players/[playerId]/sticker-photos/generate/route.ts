import { NextRequest } from "next/server";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const STICKER_RESULTS_DIR = path.join(process.cwd(), "uploads", "players", "sticker-results");

const VALID_MODELS = ["gpt-image-2", "gpt-image-1.5", "gpt-image-1-mini", "gpt-image-1"] as const;
type StickerModel = (typeof VALID_MODELS)[number];

const MODEL_COSTS: Record<StickerModel, number> = {
  "gpt-image-2": 0.10,
  "gpt-image-1.5": 0.032,
  "gpt-image-1-mini": 0.02,
  "gpt-image-1": 0.04,
};

if (!process.env.OPENAI_API_KEY) {
  console.warn("[sticker-generate] WARNING: OPENAI_API_KEY environment variable is not set. Sticker generation will fail.");
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

    if (!process.env.OPENAI_API_KEY) {
      return error("OPENAI_API_KEY is not configured on this server.", 503);
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return notFound("Player not found");

    const body = await parseBody<{ photo_id?: string; prompt?: string; model?: string }>(request);
    const { photo_id, prompt } = body;
    const modelRaw = body.model ?? "gpt-image-2";

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

    // Read image file as base64 (used by both API paths)
    const { readFile } = await import("fs/promises");
    let imageBase64: string;
    try {
      const buf = await readFile(imageAbsPath);
      imageBase64 = buf.toString("base64");
    } catch {
      return error("Could not read the reference photo from disk", 500);
    }

    // Detect MIME type from extension
    const ext = path.extname(imageAbsPath).toLowerCase().replace(".", "");
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    const startTime = Date.now();

    let openaiResult: { imageData: Buffer; elapsed: number };
    try {
      const { default: OpenAI } = await import("openai");
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      if (selectedModel === "gpt-image-1") {
        // Legacy path: images.edit() supports only gpt-image-1 (and dall-e-2)
        const { createReadStream } = await import("fs");
        const imageStream = createReadStream(imageAbsPath);

        const result = await client.images.edit({
          model: "gpt-image-1",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          image: imageStream as any,
          prompt: prompt.trim(),
          n: 1,
          size: "1024x1024",
        });

        const elapsed = (Date.now() - startTime) / 1000;
        const item = result.data?.[0];
        if (!item) throw new Error("OpenAI returned no image data");

        let imageData: Buffer;
        if (item.b64_json) {
          imageData = Buffer.from(item.b64_json, "base64");
        } else if (item.url) {
          const res = await fetch(item.url);
          if (!res.ok) throw new Error(`Failed to download generated image: HTTP ${res.status}`);
          imageData = Buffer.from(await res.arrayBuffer());
        } else {
          throw new Error("OpenAI returned neither b64_json nor url");
        }
        openaiResult = { imageData, elapsed };
      } else {
        // Modern path: responses.create() with image_generation tool.
        // gpt-image-2, gpt-image-1.5, gpt-image-1-mini use the Responses API.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await (client as any).responses.create({
          model: selectedModel,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: prompt.trim() },
                {
                  type: "input_image",
                  image_url: `data:${mimeType};base64,${imageBase64}`,
                },
              ],
            },
          ],
          tools: [{ type: "image_generation" }],
        });

        const elapsed = (Date.now() - startTime) / 1000;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const imageOutputs = (response.output as any[]).filter(
          (o: { type: string }) => o.type === "image_generation_call"
        );
        if (imageOutputs.length === 0) throw new Error("OpenAI Responses API returned no image_generation_call output");

        const b64 = imageOutputs[0].result as string;
        openaiResult = { imageData: Buffer.from(b64, "base64"), elapsed };
      }
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      console.error("[sticker-generate] OpenAI error:", msg);
      return json(
        { error: `Image generation failed. Check your OpenAI API key and quota. Details: ${msg}` },
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
