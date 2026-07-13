import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";

function authErrorResponse(msg: string) {
  if (
    msg === "Authentication required" ||
    msg === "Missing authorization token" ||
    msg === "Invalid or expired token" ||
    msg === "Manager or super admin access required"
  ) {
    return error(msg, 401);
  }
  return null;
}

export const dynamic = "force-dynamic";

/** GET /api/admin/marketing-campaigns/analytics?venueId=&range=30 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminAccess(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");
    const rangeDays = parseInt(request.nextUrl.searchParams.get("range") ?? "30", 10);

    const since = new Date();
    since.setDate(since.getDate() - rangeDays);

    // All promo codes for venue
    const codes = await prisma.promoCode.findMany({
      where: { venueId },
      select: { id: true },
    });
    const codeIds = codes.map((c) => c.id);

    if (codeIds.length === 0) {
      return json({
        redemptionsByDay: [],
        channelSplit: [],
        totalClicks: 0,
        totalRedemptions: 0,
        totalRevenue: 0,
        recentRedemptions: [],
      });
    }

    const [redemptions, clicks] = await Promise.all([
      prisma.promoRedemption.findMany({
        where: {
          promoCodeId: { in: codeIds },
          redeemedAt: { gte: since },
        },
        include: {
          player: { select: { name: true, phone: true } },
          promoCode: { select: { name: true, code: true } },
        },
        orderBy: { redeemedAt: "desc" },
      }),
      prisma.promoLinkClick.findMany({
        where: {
          promoCodeId: { in: codeIds },
          clickedAt: { gte: since },
        },
        select: { utmSource: true, clickedAt: true },
      }),
    ]);

    // Redemptions by day (local date key "YYYY-MM-DD")
    const dayMap: Record<string, number> = {};
    for (const r of redemptions) {
      const key = r.redeemedAt.toLocaleDateString("en-CA"); // YYYY-MM-DD in local
      dayMap[key] = (dayMap[key] ?? 0) + 1;
    }
    const redemptionsByDay = Object.entries(dayMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    // Channel split by utm_source (from redemptions)
    const channelMap: Record<string, number> = {};
    for (const r of redemptions) {
      const ch = r.utmSource ?? "direct";
      channelMap[ch] = (channelMap[ch] ?? 0) + 1;
    }
    const total = redemptions.length;
    const channelSplit = Object.entries(channelMap)
      .sort(([, a], [, b]) => b - a)
      .map(([channel, count]) => ({
        channel,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

    // Recent redemptions
    const recentRedemptions = redemptions.slice(0, 20).map((r) => ({
      id: r.id,
      promoName: r.promoCode.name,
      promoCode: r.promoCode.code,
      playerName: r.player.name,
      playerPhone: r.player.phone ?? "",
      discountAmount: r.discountAmount,
      finalPrice: r.finalPrice,
      redeemedAt: r.redeemedAt.toISOString(),
    }));

    return json({
      redemptionsByDay,
      channelSplit,
      totalClicks: clicks.length,
      totalRedemptions: total,
      totalRevenue: redemptions.reduce((s, r) => s + r.finalPrice, 0),
      recentRedemptions,
    });
  } catch (e) {
    const msg = (e as Error).message;
    return authErrorResponse(msg) ?? error(msg, 500);
  }
}
