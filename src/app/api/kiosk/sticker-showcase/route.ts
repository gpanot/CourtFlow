import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function packUrls(pack: {
  sticker1Url: string | null;
  sticker2Url: string | null;
  sticker3Url: string | null;
  sticker4Url: string | null;
}): string[] {
  return [pack.sticker1Url, pack.sticker2Url, pack.sticker3Url, pack.sticker4Url].filter(
    Boolean
  ) as string[];
}

export async function GET() {
  try {
    const packs = await prisma.playerStickerPack.findMany({
      where: {
        OR: [
          { sticker1Url: { not: null } },
          { sticker2Url: { not: null } },
          { sticker3Url: { not: null } },
          { sticker4Url: { not: null } },
        ],
      },
      select: {
        sticker1Url: true,
        sticker2Url: true,
        sticker3Url: true,
        sticker4Url: true,
        player: { select: { gender: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const femaleUrls: string[] = [];
    const maleUrls: string[] = [];
    const allUrls: string[] = [];

    for (const pack of packs) {
      const urls = packUrls(pack);
      allUrls.push(...urls);
      if (pack.player.gender === "male") {
        maleUrls.push(...urls);
      } else {
        femaleUrls.push(...urls);
      }
    }

    return json({
      // Legacy field — kept for backward compat
      stickers: fisherYates(allUrls).slice(0, 16),
      female: fisherYates(femaleUrls).slice(0, 24),
      male: fisherYates(maleUrls).slice(0, 24),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
