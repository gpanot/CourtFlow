import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { ensureFaceThumb } from "@/lib/player-face-thumb";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const rawId = (await params).playerId;
  const playerId = rawId.endsWith(".webp") ? rawId.slice(0, -5) : rawId;

  if (!playerId || !/^[\w-]+$/.test(playerId)) {
    return new NextResponse(null, { status: 400 });
  }

  const ok = await ensureFaceThumb(playerId);
  if (!ok) {
    return new NextResponse(null, { status: 404 });
  }

  const thumbFile = path.join(process.cwd(), "uploads", "players", "thumbs", `${playerId}.webp`);
  try {
    const buf = await readFile(thumbFile);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
