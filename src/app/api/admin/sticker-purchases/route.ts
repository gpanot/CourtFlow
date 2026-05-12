import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10)));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      prisma.stickerPaymentLog.findMany({
        orderBy: { processedAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.stickerPaymentLog.count(),
    ]);

    // Resolve player info via paymentCode → PlayerStickerPack → Player
    const codes = logs.map((l) => l.paymentCode);
    const packs = await prisma.playerStickerPack.findMany({
      where: { paymentCode: { in: codes } },
      select: {
        paymentCode: true,
        player: { select: { id: true, name: true, phone: true } },
      },
    });
    const packByCode = Object.fromEntries(packs.map((p) => [p.paymentCode!, p.player]));

    const purchases = logs.map((l) => {
      const player = packByCode[l.paymentCode] ?? null;
      return {
        id: l.id,
        sepayId: l.sepayId,
        paymentCode: l.paymentCode,
        transferAmount: l.transferAmount,
        content: l.content,
        processedAt: l.processedAt.toISOString(),
        playerName: player?.name ?? null,
        playerPhone: player?.phone ?? null,
        playerId: player?.id ?? null,
      };
    });

    return json({ purchases, total, page, totalPages: Math.ceil(total / limit) });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
