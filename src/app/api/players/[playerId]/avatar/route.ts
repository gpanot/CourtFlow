import { NextRequest } from "next/server";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

const AVATARS_DIR = path.join(process.cwd(), "uploads", "players", "avatars");
const MAX_SIZE = 200 * 1024; // 200 KB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = requireAuth(request.headers);
    const { playerId } = await params;

    if (auth.role === "player" && auth.id !== playerId) {
      return error("Cannot update another player's avatar", 403);
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return notFound("Player not found");

    const formData = await request.formData();
    const file = formData.get("avatar") as File | null;
    if (!file) return error("No avatar file provided", 400);

    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_SIZE) {
      return error(`File too large (${Math.round(buf.length / 1024)}KB). Max ${MAX_SIZE / 1024}KB.`, 400);
    }

    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const filename = `${playerId}.${ext}`;

    await mkdir(AVATARS_DIR, { recursive: true });
    await writeFile(path.join(AVATARS_DIR, filename), buf);

    const avatarPhotoPath = `/uploads/players/avatars/${filename}?t=${Date.now()}`;
    const updated = await prisma.player.update({
      where: { id: playerId },
      data: { avatarPhotoPath },
    });

    return json({ avatarPhotoPath: updated.avatarPhotoPath });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = requireAuth(request.headers);
    const { playerId } = await params;

    if (auth.role === "player" && auth.id !== playerId) {
      return error("Cannot delete another player's avatar", 403);
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return notFound("Player not found");

    if (player.avatarPhotoPath) {
      const urlPath = player.avatarPhotoPath.split("?")[0];
      const filePath = path.join(process.cwd(), urlPath);
      try { await unlink(filePath); } catch { /* file may not exist */ }
    }

    await prisma.player.update({
      where: { id: playerId },
      data: { avatarPhotoPath: null },
    });

    return json({ avatarPhotoPath: null });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
