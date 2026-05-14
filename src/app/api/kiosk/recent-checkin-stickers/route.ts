import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
function validateKioskSecret(request: NextRequest): boolean {
  const secret = request.headers.get("x-kiosk-secret");
  return !!secret && secret === process.env.STICKER_KIOSK_SECRET;
}

export async function GET(request: NextRequest) {
  try {
    if (!validateKioskSecret(request)) {
      return error("Unauthorized", 401);
    }

    // Find the most recently checked-in CheckInPlayers (last 60 minutes, up to 30 entries)
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const recentCheckIns = await prisma.checkInRecord.findMany({
      where: { checkedInAt: { gte: since } },
      orderBy: { checkedInAt: "desc" },
      take: 30,
      select: {
        player: { select: { phone: true, name: true } },
        checkedInAt: true,
      },
    });

    if (recentCheckIns.length === 0) {
      return json({ stickers: [], players: [] });
    }

    // Get unique phones from recent check-ins (preserve order — most recent first)
    const seenPhones = new Set<string>();
    const orderedPhones: string[] = [];
    for (const ci of recentCheckIns) {
      const phone = ci.player.phone;
      if (!seenPhones.has(phone)) {
        seenPhones.add(phone);
        orderedPhones.push(phone);
      }
    }

    // Find Players (face-recognition model) matching those phones that have sticker packs
    const players = await prisma.player.findMany({
      where: { phone: { in: orderedPhones } },
      select: {
        phone: true,
        name: true,
        gender: true,
        stickerPacks: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            sticker1Url: true,
            sticker2Url: true,
            sticker3Url: true,
            sticker4Url: true,
          },
        },
      },
    });

    // Build ordered result — preserve check-in recency order
    const phoneToPlayer = new Map(players.map((p) => [p.phone, p]));
    const result: { name: string; stickers: string[]; gender: string }[] = [];

    for (const phone of orderedPhones) {
      const player = phoneToPlayer.get(phone);
      if (!player || player.stickerPacks.length === 0) continue;
      const pack = player.stickerPacks[0];
      const stickers = [pack.sticker1Url, pack.sticker2Url, pack.sticker3Url, pack.sticker4Url].filter(
        Boolean
      ) as string[];
      if (stickers.length > 0) {
        result.push({ name: player.name.split(" ")[0], stickers, gender: player.gender });
      }
      if (result.length >= 8) break; // max 8 recent players
    }

    const allStickers = result.flatMap((r) => r.stickers);
    const femaleStickers = result.filter((r) => r.gender === "female").flatMap((r) => r.stickers);
    const maleStickers = result.filter((r) => r.gender === "male").flatMap((r) => r.stickers);
    return json({ stickers: allStickers, female: femaleStickers, male: maleStickers, players: result });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
