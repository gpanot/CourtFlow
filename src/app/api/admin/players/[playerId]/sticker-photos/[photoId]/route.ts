import { NextRequest } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
/**
 * DELETE: remove a specific uploaded sticker photo from disk and database.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string; photoId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId, photoId } = await params;

    const photo = await prisma.playerStickerPhoto.findFirst({
      where: { id: photoId, playerId },
    });
    if (!photo) return notFound("Sticker photo not found");

    const urlPath = photo.imageUrl.split("?")[0];
    try {
      await unlink(path.join(process.cwd(), urlPath));
    } catch {
      // file may not exist on disk
    }

    await prisma.playerStickerPhoto.delete({ where: { id: photoId } });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
