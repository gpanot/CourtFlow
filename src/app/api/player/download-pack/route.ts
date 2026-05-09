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

    const stickerPack = await prisma.playerStickerPack.findUnique({
      where: { playerId: session.playerId },
      include: { player: { select: { name: true } } },
    });

    if (!stickerPack) {
      return error("No sticker pack found", 404);
    }

    const playerName = stickerPack.player.name.split(" ")[0];
    const zipFilename = `stickers_${playerName.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;

    const packDir = path.join(
      process.cwd(),
      "uploads",
      "players",
      "sticker-packs",
      session.playerId
    );

    const files: { absPath: string; name: string }[] = [];
    for (let i = 1; i <= 4; i++) {
      const absPath = path.join(packDir, `sticker_${i}.webp`);
      try {
        await stat(absPath);
        files.push({ absPath, name: `sticker_${i}.webp` });
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
