import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { stat } from "fs/promises";
import { prisma } from "@/lib/db";
import { error } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get("token");
    if (!token) {
      return error("token is required", 400);
    }

    const session = await prisma.stickerSession.findUnique({
      where: { token },
    });

    if (!session) {
      return error("Session not found", 404);
    }

    if (session.expiresAt < new Date()) {
      return error("Session expired", 401);
    }

    const stickerPack = await prisma.playerStickerPack.findFirst({
      where: { playerId: session.playerId },
      orderBy: { createdAt: "desc" },
    });

    if (!stickerPack) {
      return error("No sticker pack found", 404);
    }

    const packPlayer = await prisma.player.findUnique({ where: { id: session.playerId }, select: { name: true } });
    const playerName = packPlayer?.name?.split(" ")[0] ?? "player";
    const zipFilename = `stickers_${playerName.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;

    const urls = [stickerPack.sticker1Url, stickerPack.sticker2Url, stickerPack.sticker3Url, stickerPack.sticker4Url];
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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const archiver = require("archiver");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createReadStream } = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const archive: any = archiver("zip", { zlib: { level: 6 } });
    const chunks: Uint8Array[] = [];

    await new Promise<void>((resolve, reject) => {
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", resolve);
      archive.on("error", reject);

      for (const file of files) {
        archive.append(createReadStream(file.absPath), { name: file.name });
      }
      archive.finalize();
    });

    const zipBuffer = Buffer.concat(chunks);

    return new NextResponse(zipBuffer, {
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
