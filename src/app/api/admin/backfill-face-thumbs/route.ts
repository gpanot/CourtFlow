import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { ensureFaceThumb, playerIdFromFacePhotoPath } from "@/lib/player-face-thumb";

export const dynamic = "force-dynamic";
// Long timeout — processing hundreds of images
export const maxDuration = 300;

export async function POST(req: Request) {
  // Accept either a JWT superadmin token OR a matching SITE_PASSWORD query param / header
  const sitePassword = process.env.SITE_PASSWORD?.trim();
  const { searchParams } = new URL(req.url);
  const querySecret = searchParams.get("secret")?.trim();
  const headerSecret = req.headers.get("x-admin-secret")?.trim();
  const secretOk = sitePassword && (querySecret === sitePassword || headerSecret === sitePassword);

  if (!secretOk) {
    try {
      requireSuperAdmin(req.headers);
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const players = await prisma.player.findMany({
    where: { facePhotoPath: { not: null } },
    select: { id: true, facePhotoPath: true },
  });

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of players) {
    const thumbId = (p.facePhotoPath ? playerIdFromFacePhotoPath(p.facePhotoPath) : null) ?? p.id;
    const success = await ensureFaceThumb(thumbId);
    if (success) ok++;
    else skipped++;
  }

  return NextResponse.json({ total: players.length, ok, skipped, failed });
}
