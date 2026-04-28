import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { error, json, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

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
    const removeBgApiKey = process.env.REMOVE_BG_API_KEY?.trim();
    if (!removeBgApiKey) {
      return error("REMOVE_BG_API_KEY is not configured", 500);
    }

    const { playerId } = await params;
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true, facePhotoPath: true },
    });

    if (!player) return notFound("Player not found");
    if (!player.facePhotoPath) {
      return error("No facePhotoPath found for this player", 400);
    }

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

    const sourceBytes = Buffer.from(await sourceRes.arrayBuffer());
    const sourceType =
      sourceRes.headers.get("content-type") || "image/jpeg";

    const formData = new FormData();
    formData.append(
      "image_file",
      new Blob([sourceBytes], { type: sourceType }),
      `${player.id}.jpg`
    );
    formData.append("size", "auto");

    const removeRes = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": removeBgApiKey,
      },
      body: formData,
    });

    if (!removeRes.ok) {
      const errText = await removeRes.text();
      return error(
        `remove.bg failed (${removeRes.status}): ${errText || "unknown error"}`,
        400
      );
    }

    const outBytes = Buffer.from(await removeRes.arrayBuffer());
    return json({
      success: true,
      imageBase64: outBytes.toString("base64"),
      mimeType: "image/png",
      fileName: `${player.name || "player"}-bg-removed.png`,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
