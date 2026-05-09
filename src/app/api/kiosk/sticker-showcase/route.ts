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
      },
      take: 20,
    });

    const allUrls: string[] = [];
    for (const pack of packs) {
      for (const url of [pack.sticker1Url, pack.sticker2Url, pack.sticker3Url, pack.sticker4Url]) {
        if (url) allUrls.push(url);
      }
    }

    const shuffled = fisherYates(allUrls).slice(0, 16);
    return json({ stickers: shuffled });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
