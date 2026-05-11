import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { prisma } from "@/lib/db";
import { error, json, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { removeBackgroundFromBase64 } from "@/lib/remove-bg";

export const dynamic = "force-dynamic";
function toAbsolutePhotoUrl(photoPath: string, origin: string): string {
  if (photoPath.startsWith("http://") || photoPath.startsWith("https://")) {
    return photoPath;
  }
  return new URL(photoPath, origin).toString();
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);

    const { playerId } = await params;
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, facePhotoPath: true },
    });

    if (!player) return notFound("Player not found");
    if (!player.facePhotoPath) {
      return error("No facePhotoPath found for this player", 400);
    }

    let sourceBytes: Buffer;
    if (player.facePhotoPath.startsWith("/uploads/")) {
      const relPath = player.facePhotoPath.replace(/^\/+/, "");
      const absPath = join(process.cwd(), relPath);
      sourceBytes = await readFile(absPath);
    } else {
      const sourceUrl = toAbsolutePhotoUrl(
        player.facePhotoPath,
        request.nextUrl.origin
      );
      const sourceRes = await fetch(sourceUrl, { cache: "no-store" });
      if (!sourceRes.ok) {
        return error(
          `Failed to fetch source photo (${sourceRes.status})`,
          400
        );
      }
      sourceBytes = Buffer.from(await sourceRes.arrayBuffer());
    }

    const resultBase64 = await removeBackgroundFromBase64(
      sourceBytes.toString("base64")
    );
    if (!resultBase64) {
      return error("Background removal failed — check REMOVE_BG_API_KEY and server logs", 500);
    }

    return json({
      success: true,
      imageBase64: resultBase64,
      mimeType: "image/png",
      fileName: `${player.name || "player"}-bg-removed.png`,
    });
  } catch (e) {
    console.error("[remove-bg]", e);
    return error((e as Error).message, 500);
  }
}
