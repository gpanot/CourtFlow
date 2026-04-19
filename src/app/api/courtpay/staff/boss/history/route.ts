import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { getWeekBounds } from "@/lib/billing";

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;
    const days = parseInt(searchParams.get("days") || "90", 10);

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    // Build time boundaries in local-midnight terms
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const { weekStart, weekEnd } = getWeekBounds(now); // Monday -> Sunday

    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);

    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    // Fetch CourtPay billable payments for this venue.
    // Keep this aligned with billing logic:
    // - CourtPay only (checkInPlayerId not null)
    // - include confirmed + cancelled (cancelled still went through)
    const [recentPayments, allPayments] = await Promise.all([
      prisma.pendingPayment.findMany({
        where: {
          venueId,
          checkInPlayerId: { not: null },
          status: { in: ["confirmed", "cancelled"] },
          confirmedAt: { gte: since },
        },
        include: { checkInPlayer: true },
        orderBy: { confirmedAt: "desc" },
      }),
      // Total all-time revenue
      prisma.pendingPayment.aggregate({
        where: {
          venueId,
          checkInPlayerId: { not: null },
          status: { in: ["confirmed", "cancelled"] },
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    // Revenue summary buckets
    const bucket = (from: Date, to?: Date) => {
      const filtered = recentPayments.filter((p) => {
        const t = (p.confirmedAt ?? p.createdAt).getTime();
        return t >= from.getTime() && (!to || t < to.getTime());
      });
      return {
        total: filtered.reduce((s, p) => s + p.amount, 0),
        count: filtered.length,
      };
    };

    const todayBucket = bucket(todayStart);
    const yesterdayBucket = bucket(yesterdayStart, todayStart);
    // Use explicit week end so "This week" follows Monday -> Sunday window.
    const weekExclusiveEnd = new Date(weekEnd.getTime() + 1);
    const weekBucket = bucket(weekStart, weekExclusiveEnd);
    const monthBucket = bucket(monthStart);

    const revenueSummary = {
      today: todayBucket,
      yesterday: yesterdayBucket,
      thisWeek: weekBucket,
      thisMonth: monthBucket,
      allTime: {
        total: allPayments._sum.amount ?? 0,
        count: allPayments._count.id,
      },
    };

    // Daily revenue breakdown
    const dailyRevenue: Record<string, { date: string; total: number; count: number }> = {};
    for (const p of recentPayments) {
      const day = (p.confirmedAt || p.createdAt).toISOString().slice(0, 10);
      if (!dailyRevenue[day]) dailyRevenue[day] = { date: day, total: 0, count: 0 };
      dailyRevenue[day].total += p.amount;
      dailyRevenue[day].count += 1;
    }

    return NextResponse.json({
      payments: recentPayments.map((p) => ({
        id: p.id,
        playerName: p.checkInPlayer?.name || "Unknown",
        amount: p.amount,
        type: p.type,
        paymentMethod: p.paymentMethod,
        confirmedAt: p.confirmedAt,
        paymentRef: p.paymentRef,
      })),
      dailyRevenue: Object.values(dailyRevenue).sort(
        (a, b) => b.date.localeCompare(a.date)
      ),
      revenueSummary,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
