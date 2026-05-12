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
            gender: true,
            facePhotoPath: true,
            avatarPhotoPath: true,
          },
        },
      },
      where: gender ? { player: { gender: gender as Gender } } : undefined,
    });

    const result: StickerExplorerPack[] = packs.map((p) => ({
      packId: p.id,
      playerId: p.playerId,
      playerName: p.player.name,
      playerGender: p.player.gender ?? "other",
      playerFacePhotoPath: p.player.facePhotoPath,
      playerAvatarPhotoPath: p.player.avatarPhotoPath,
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
