import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { stat, readFile } from "fs/promises";
import { prisma } from "@/lib/db";
import { error, notFound } from "@/lib/api-helpers";
import { verifyToken } from "@/lib/auth";

/**
 * GET: Download the 4 split stickers as a .zip file.
 * Supports auth via Authorization header OR ?token= query param (for direct download links).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    // Support token via query param for download links
    const url = new URL(request.url);
    const queryToken = url.searchParams.get("token");
    const headerAuth = request.headers.get("authorization");
    const token = queryToken ?? (headerAuth?.startsWith("Bearer ") ? headerAuth.slice(7) : null);

    if (!token) return error("Missing authorization token", 401);
    const payload = verifyToken(token);
    if (!payload) return error("Invalid or expired token", 401);
    if (payload.role !== "superadmin") return error("Super admin access required", 403);

    const { playerId } = await params;

    const pack = await prisma.playerStickerPack.findFirst({
      where: { playerId },
      orderBy: { createdAt: "desc" },
    });
    if (!pack) return notFound("No sticker pack found. Run 'Split stickers' first.");
    const packPlayer = await prisma.player.findUnique({ where: { id: playerId }, select: { name: true } });

    const urls = [pack.sticker1Url, pack.sticker2Url, pack.sticker3Url, pack.sticker4Url];
    const files: { absPath: string; name: string }[] = [];

    for (let i = 0; i < urls.length; i++) {
      const stickerUrl = urls[i];
      if (!stickerUrl) continue;
      const relPath = stickerUrl.split("?")[0];
      const absPath = path.join(process.cwd(), relPath);
      try {
        await stat(absPath);
        files.push({ absPath, name: `sticker_${i + 1}.webp` });
      } catch {
        // skip missing files
      }
    }

    if (files.length === 0) {
      return error("No sticker files found on disk", 404);
    }

    const playerName = packPlayer?.name?.split(" ")[0] ?? "player";
    const zipFilename = `stickers_${playerName.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AdmZip = require("adm-zip");
    const zip = new AdmZip();

    for (const file of files) {
      const fileBuffer = await readFile(file.absPath);
      zip.addFile(file.name, fileBuffer);
      console.log(`[download-pack] Added ${file.name} (${fileBuffer.length} bytes)`);
    }

    const zipBuffer: Buffer = zip.toBuffer();
    console.log(`[download-pack] ZIP ready: ${zipBuffer.length} bytes, filename: ${zipFilename}`);

    // Copy into a plain ArrayBuffer so TypeScript accepts it as BodyInit
    const arrayBuffer = zipBuffer.buffer.slice(
      zipBuffer.byteOffset,
      zipBuffer.byteOffset + zipBuffer.byteLength
    );

    return new NextResponse(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipFilename}"`,
        "Content-Length": String(zipBuffer.length),
      },
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
