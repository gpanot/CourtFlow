import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Vietnam UTC+7 offset in ms */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function vnStartOfDay(date: Date): Date {
  const vnMs = date.getTime() + VN_OFFSET_MS;
  const vnMidnight = new Date(vnMs);
  vnMidnight.setUTCHours(0, 0, 0, 0);
  return new Date(vnMidnight.getTime() - VN_OFFSET_MS);
}

function vnStartOfWeek(date: Date): Date {
  const startOfDay = vnStartOfDay(date);
  const vnDate = new Date(startOfDay.getTime() + VN_OFFSET_MS);
  const dow = vnDate.getUTCDay(); // 0=Sun
  const monday = new Date(vnDate.getTime() - (dow === 0 ? 6 : dow - 1) * 86400000);
  monday.setUTCHours(0, 0, 0, 0);
  return new Date(monday.getTime() - VN_OFFSET_MS);
}

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const now = new Date();
    const todayStart = vnStartOfDay(now);
    const weekStart = vnStartOfWeek(now);

    // Build last-7-days date list (VN time, newest last)
    const last7: { date: string; utcStart: Date; utcEnd: Date }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const start = vnStartOfDay(d);
      const end = new Date(start.getTime() + 86400000);
      const vnDate = new Date(start.getTime() + VN_OFFSET_MS);
      const yyyy = vnDate.getUTCFullYear();
      const mm = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(vnDate.getUTCDate()).padStart(2, "0");
      last7.push({ date: `${yyyy}-${mm}-${dd}`, utcStart: start, utcEnd: end });
    }

    const [
      scansTotal,
      scansToday,
      scansThisWeek,
      packsGenerated,
      purchasesTotal,
      purchasesToday,
      revenueAgg,
      revenueTodayAgg,
    ] = await Promise.all([
      prisma.stickerSession.count(),
      prisma.stickerSession.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.stickerSession.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.playerStickerPack.count({ where: { sticker1Url: { not: null } } }),
      prisma.stickerPaymentLog.count(),
      prisma.stickerPaymentLog.count({ where: { processedAt: { gte: todayStart } } }),
      prisma.stickerPaymentLog.aggregate({ _sum: { transferAmount: true } }),
      prisma.stickerPaymentLog.aggregate({
        _sum: { transferAmount: true },
        where: { processedAt: { gte: todayStart } },
      }),
    ]);

    const revenueTotal = revenueAgg._sum.transferAmount ?? 0;
    const revenueToday = revenueTodayAgg._sum.transferAmount ?? 0;
    const conversionRate =
      scansTotal > 0 ? Math.round((purchasesTotal / scansTotal) * 1000) / 10 : 0;

    // Per-day breakdown for last 7 days
    const last7Days = await Promise.all(
      last7.map(async ({ date, utcStart, utcEnd }) => {
        const [scans, purchasesDay, revDay] = await Promise.all([
          prisma.stickerSession.count({ where: { createdAt: { gte: utcStart, lt: utcEnd } } }),
          prisma.stickerPaymentLog.count({ where: { processedAt: { gte: utcStart, lt: utcEnd } } }),
          prisma.stickerPaymentLog.aggregate({
            _sum: { transferAmount: true },
            where: { processedAt: { gte: utcStart, lt: utcEnd } },
          }),
        ]);
        return { date, scans, purchases: purchasesDay, revenue: revDay._sum.transferAmount ?? 0 };
      })
    );

    return json({
      scansTotal,
      scansToday,
      scansThisWeek,
      packsGenerated,
      purchasesTotal,
      purchasesToday,
      revenueTotal,
      revenueToday,
      conversionRate,
      last7Days,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
