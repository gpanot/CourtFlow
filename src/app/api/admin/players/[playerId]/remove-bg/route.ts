import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
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

    let sourceBytes: Buffer;
    let sourceType = "image/jpeg";
    if (player.facePhotoPath.startsWith("/uploads/")) {
      // Prefer local disk read for mounted volume assets; avoids localhost TLS/self-signed issues in dev.
      const relPath = player.facePhotoPath.replace(/^\/+/, "");
      const absPath = join(process.cwd(), relPath);
      sourceBytes = await readFile(absPath);
      const p = player.facePhotoPath.toLowerCase();
      if (p.endsWith(".png")) sourceType = "image/png";
      else if (p.endsWith(".webp")) sourceType = "image/webp";
      else sourceType = "image/jpeg";
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
      sourceType =
        sourceRes.headers.get("content-type") || "image/jpeg";
    }

    const formData = new FormData();
    const sourceBlob = new Blob([new Uint8Array(sourceBytes)], { type: sourceType });
    formData.append(
      "image_file",
      sourceBlob,
      `${player.id}.jpg`
    );
    formData.append("size", "auto");
    // Ensure remove.bg keeps the person/face and removes only background.
    formData.append("type", "person");
    formData.append("format", "png");

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
    console.error("[remove-bg]", e);
    return error((e as Error).message, 500);
  }
}
