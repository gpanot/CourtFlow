import { NextRequest } from "next/server";
import { rm } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
/**
 * DELETE: remove a specific sticker pack (all 4 individual stickers) from disk and DB.
 * The parent sticker result (the 1-image generation) is NOT affected.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string; packId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId, packId } = await params;

    const pack = await prisma.playerStickerPack.findFirst({
      where: { id: packId, playerId },
    });
    if (!pack) return notFound("Sticker pack not found");

    // Derive the timestamped subfolder from any sticker URL (e.g. /uploads/players/sticker-packs/{playerId}/{ts}/sticker_1.webp)
    const anyUrl = pack.sticker1Url ?? pack.sticker2Url ?? pack.sticker3Url ?? pack.sticker4Url;
    if (anyUrl) {
      const urlPath = anyUrl.split("?")[0];
      const subDir = path.dirname(path.join(process.cwd(), urlPath));
      try {
        await rm(subDir, { recursive: true, force: true });
      } catch {
        // directory may not exist
      }
    }

    await prisma.playerStickerPack.delete({ where: { id: packId } });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
