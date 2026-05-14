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

    // Resolve player: PayOS logs match via payosOrderCode; legacy SePay logs via paymentCode
    const orderCodes = logs.map((l) => l.payosOrderCode).filter(Boolean) as string[];
    const paymentCodes = logs.map((l) => l.paymentCode).filter(Boolean) as string[];

    const [packsByOrder, packsByCode] = await Promise.all([
      orderCodes.length > 0
        ? prisma.playerStickerPack.findMany({
            where: { payosOrderCode: { in: orderCodes } },
            select: { payosOrderCode: true, player: { select: { id: true, name: true, phone: true } } },
          })
        : Promise.resolve([]),
      paymentCodes.length > 0
        ? prisma.playerStickerPack.findMany({
            where: { paymentCode: { in: paymentCodes } },
            select: { paymentCode: true, player: { select: { id: true, name: true, phone: true } } },
          })
        : Promise.resolve([]),
    ]);

    const byOrderCode = Object.fromEntries(packsByOrder.map((p) => [p.payosOrderCode!, p.player]));
    const byPaymentCode = Object.fromEntries(packsByCode.map((p) => [p.paymentCode!, p.player]));

    const purchases = logs.map((l) => {
      const player = byOrderCode[l.payosOrderCode] ?? byPaymentCode[l.paymentCode] ?? null;
      return {
        id: l.id,
        payosOrderCode: l.payosOrderCode,
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
