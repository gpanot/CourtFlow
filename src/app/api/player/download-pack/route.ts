import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { error } from "@/lib/api-helpers";
import { generateHowToCard } from "@/lib/generate-howto-card";

export const dynamic = "force-dynamic";
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

    const packPlayer = await prisma.player.findUnique({
      where: { id: session.playerId },
      select: { name: true },
    });
    const playerName = packPlayer?.name?.split(" ")[0] ?? "player";
    const zipFilename = `stickers_${playerName.replace(/[^a-zA-Z0-9]/g, "_")}.zip`;

    // Resolve the base URL to fetch sticker files from their public path
    const baseUrl =
      process.env.APP_URL ??
      (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${process.env.PORT ?? 3000}`);

    const stickerUrls = [
      stickerPack.sticker1Url,
      stickerPack.sticker2Url,
      stickerPack.sticker3Url,
      stickerPack.sticker4Url,
    ].filter(Boolean) as string[];

    if (stickerUrls.length === 0) {
      return error("No sticker files found", 404);
    }

    // Fetch each sticker from its public URL and collect as buffers
    const fileEntries: { name: string; buffer: Buffer }[] = [];
    await Promise.all(
      stickerUrls.map(async (url, i) => {
        const publicUrl = url.startsWith("http") ? url : `${baseUrl}${url.split("?")[0]}`;
        try {
          const res = await fetch(publicUrl);
          if (!res.ok) return;
          const buf = Buffer.from(await res.arrayBuffer());
          fileEntries[i] = { name: `sticker_${i + 1}.webp`, buffer: buf };
        } catch {
          // skip failed fetches
        }
      })
    );

    const validFiles = fileEntries.filter(Boolean);
    if (validFiles.length === 0) {
      return error("Could not fetch sticker files", 404);
    }

    // Generate the instruction card PNG
    let howToBuffer: Buffer | null = null;
    try {
      howToBuffer = await generateHowToCard();
    } catch {
      // non-fatal — continue without the card
    }

    // Build ZIP in memory — how-to card goes first so it appears at the top
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const archiver = require("archiver");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const archive: any = archiver("zip", { zlib: { level: 6 } });
    const chunks: Uint8Array[] = [];

    await new Promise<void>((resolve, reject) => {
      archive.on("data", (chunk: Buffer) => chunks.push(chunk));
      archive.on("end", resolve);
      archive.on("error", reject);

      // Instruction card first
      if (howToBuffer) {
        archive.append(howToBuffer, { name: "how-to-use.png" });
      }
      for (const file of validFiles) {
        archive.append(file.buffer, { name: file.name });
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
