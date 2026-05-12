import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { Gender } from "@prisma/client";

export const dynamic = "force-dynamic";

export interface StickerExplorerPack {
  packId: string;
  playerId: string;
  playerName: string;
  playerGender: string;
  playerFacePhotoPath: string | null;
  playerAvatarPhotoPath: string | null;
  playerPhone: string;
  checkInCount: number;
  sticker1Url: string | null;
  sticker2Url: string | null;
  sticker3Url: string | null;
  sticker4Url: string | null;
  isPaid: boolean;
  createdAt: string;
}

/**
 * GET /api/admin/sticker-explorer
 * Returns all PlayerStickerPack rows (newest first) with player details.
 * Optional ?gender=male|female filter.
 */
export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const gender = new URL(request.url).searchParams.get("gender"); // "male" | "female" | null

    const packs = await prisma.playerStickerPack.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            phone: true,
            gender: true,
            facePhotoPath: true,
            avatarPhotoPath: true,
          },
        },
      },
      where: gender ? { player: { gender: gender as Gender } } : undefined,
    });

    // Build phone → total check-in count map
    const phones = [...new Set(packs.map((p) => p.player.phone))];
    const checkInRows = await prisma.checkInPlayer.findMany({
      where: { phone: { in: phones } },
      select: {
        phone: true,
        _count: { select: { checkIns: true } },
      },
    });
    const checkInByPhone: Record<string, number> = {};
    for (const row of checkInRows) {
      checkInByPhone[row.phone] = (checkInByPhone[row.phone] ?? 0) + row._count.checkIns;
    }

    const result: StickerExplorerPack[] = packs.map((p) => ({
      packId: p.id,
      playerId: p.playerId,
      playerName: p.player.name,
      playerGender: p.player.gender ?? "other",
      playerFacePhotoPath: p.player.facePhotoPath,
      playerAvatarPhotoPath: p.player.avatarPhotoPath,
      playerPhone: p.player.phone,
      checkInCount: checkInByPhone[p.player.phone] ?? 0,
      sticker1Url: p.sticker1Url,
      sticker2Url: p.sticker2Url,
      sticker3Url: p.sticker3Url,
      sticker4Url: p.sticker4Url,
      isPaid: p.isPaid,
      createdAt: p.createdAt.toISOString(),
    }));

    return json(result);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
