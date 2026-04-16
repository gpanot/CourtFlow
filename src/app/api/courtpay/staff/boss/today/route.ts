import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const [checkIns, revenue, activeSubscribers, pendingPayments] =
      await Promise.all([
        prisma.checkInRecord.count({
          where: {
            venueId,
            checkedInAt: { gte: todayStart, lte: todayEnd },
          },
        }),
        prisma.pendingPayment.aggregate({
          where: {
            venueId,
            status: "confirmed",
            confirmedAt: { gte: todayStart, lte: todayEnd },
            checkInPlayerId: { not: null },
          },
          _sum: { amount: true },
        }),
        prisma.playerSubscription.count({
          where: { venueId, status: "active", expiresAt: { gt: now } },
        }),
        prisma.pendingPayment.count({
          where: {
            venueId,
            status: "pending",
            checkInPlayerId: { not: null },
          },
        }),
      ]);

    const recentCheckIns = await prisma.checkInRecord.findMany({
      where: {
        venueId,
        checkedInAt: { gte: todayStart, lte: todayEnd },
      },
      include: { player: true },
      orderBy: { checkedInAt: "desc" },
      take: 20,
    });

    return NextResponse.json({
      checkInsToday: checkIns,
      revenueToday: revenue._sum.amount || 0,
      activeSubscribers,
      pendingPayments,
      recentCheckIns: recentCheckIns.map((ci) => ({
        id: ci.id,
        playerName: ci.player.name,
        playerPhone: ci.player.phone,
        checkedInAt: ci.checkedInAt,
        source: ci.source,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
