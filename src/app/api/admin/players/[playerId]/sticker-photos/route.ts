import { NextRequest } from "next/server";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const STICKER_PHOTOS_DIR = path.join(process.cwd(), "uploads", "players", "sticker-photos");
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * POST: upload an extra sticker reference photo for a player (slots 2–4).
 * Body: multipart/form-data with `photo` (File) and `slotIndex` (2|3|4).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return notFound("Player not found");

    const formData = await request.formData();
    const file = formData.get("photo") as File | null;
    const slotIndexRaw = formData.get("slotIndex");

    if (!file) return error("No photo file provided", 400);

    const slotIndex = Number(slotIndexRaw);
    if (!Number.isInteger(slotIndex) || slotIndex < 2 || slotIndex > 4) {
      return error("slotIndex must be 2, 3, or 4", 400);
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_SIZE) {
      return error(`File too large (${(buf.length / (1024 * 1024)).toFixed(1)} MB). Max 5 MB.`, 400);
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `${playerId}_slot${slotIndex}.${ext}`;

    await mkdir(STICKER_PHOTOS_DIR, { recursive: true });
    await writeFile(path.join(STICKER_PHOTOS_DIR, filename), buf);

    const imageUrl = `/uploads/players/sticker-photos/${filename}?t=${Date.now()}`;

    // Upsert: replace any existing photo in this slot
    const existing = await prisma.playerStickerPhoto.findUnique({
      where: { playerId_slotIndex: { playerId, slotIndex } },
    });
    if (existing) {
      const oldPath = existing.imageUrl.split("?")[0];
      try {
        await unlink(path.join(process.cwd(), oldPath));
      } catch {
        // file may not exist on disk
      }
    }

    const record = await prisma.playerStickerPhoto.upsert({
      where: { playerId_slotIndex: { playerId, slotIndex } },
      create: { playerId, imageUrl, slotIndex },
      update: { imageUrl },
    });

    return json({ id: record.id, imageUrl: record.imageUrl, slotIndex: record.slotIndex });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

/**
 * GET: list all uploaded sticker photos for a player (slots 2–4).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return notFound("Player not found");

    const photos = await prisma.playerStickerPhoto.findMany({
      where: { playerId },
      orderBy: { slotIndex: "asc" },
    });

    return json(photos.map((p) => ({ id: p.id, imageUrl: p.imageUrl, slotIndex: p.slotIndex })));
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
