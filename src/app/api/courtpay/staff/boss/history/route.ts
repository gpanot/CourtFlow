import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { getWeekBounds } from "@/lib/billing";

export const dynamic = "force-dynamic";
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

    const partyForRow = (p: { partyCount: number }) => {
      const n = p.partyCount;
      return typeof n === "number" && n > 0 ? n : 1;
    };

    const [recentPayments, allPayments, allTimePeopleRows] = await Promise.all([
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
      // Total all-time revenue — confirmed only
      prisma.pendingPayment.aggregate({
        where: {
          venueId,
          checkInPlayerId: { not: null },
          status: "confirmed",
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
      prisma.$queryRaw<[{ s: bigint }]>`
        SELECT COALESCE(SUM(GREATEST(COALESCE(party_count, 1), 1)), 0)::bigint AS s
        FROM pending_payments
        WHERE venue_id = ${venueId}
          AND check_in_player_id IS NOT NULL
          AND status = 'confirmed'
      `,
    ]);

    const allTimePeopleTotal = Number(allTimePeopleRows[0]?.s ?? 0);

    // Revenue summary buckets — revenue is confirmed-only; count/peopleTotal include cancelled
    const bucket = (from: Date, to?: Date) => {
      const filtered = recentPayments.filter((p) => {
        const t = (p.confirmedAt ?? p.createdAt).getTime();
        return t >= from.getTime() && (!to || t < to.getTime());
      });
      return {
        total: filtered.reduce((s, p) => s + (p.status === "confirmed" ? p.amount : 0), 0),
        count: filtered.filter((p) => p.status === "confirmed").length,
        peopleTotal: filtered.reduce((s, p) => s + partyForRow(p), 0),
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
        peopleTotal: allTimePeopleTotal,
      },
    };

    // Daily revenue breakdown — revenue confirmed-only; count/peopleTotal include cancelled
    const dailyRevenue: Record<string, { date: string; total: number; count: number; peopleTotal: number }> = {};
    for (const p of recentPayments) {
      const day = (p.confirmedAt || p.createdAt).toISOString().slice(0, 10);
      if (!dailyRevenue[day]) {
        dailyRevenue[day] = { date: day, total: 0, count: 0, peopleTotal: 0 };
      }
      if (p.status === "confirmed") {
        dailyRevenue[day].total += p.amount;
        dailyRevenue[day].count += 1;
      }
      dailyRevenue[day].peopleTotal += partyForRow(p);
    }

    // Monthly revenue breakdown with nested weeks (ISO Monday-based weeks)
    // Week key: "YYYY-WW" (ISO week). Week boundaries: Monday 00:00 → Sunday 23:59
    const getISOWeekMonday = (d: Date): Date => {
      const day = d.getDay(); // 0=Sun,1=Mon,...
      const diff = (day === 0 ? -6 : 1 - day); // days to subtract to reach Monday
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      monday.setHours(0, 0, 0, 0);
      return monday;
    };

    type WeekBucket = { weekStart: string; weekEnd: string; total: number; count: number; peopleTotal: number };
    type MonthBucket = { month: string; total: number; count: number; peopleTotal: number; weeks: WeekBucket[] };

    const monthlyMap: Record<string, MonthBucket> = {};
    const weekMap: Record<string, WeekBucket> = {};

    for (const p of recentPayments) {
      const d = p.confirmedAt || p.createdAt;
      const monthKey = d.toISOString().slice(0, 7); // "YYYY-MM"

      const monday = getISOWeekMonday(d);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      sunday.setHours(23, 59, 59, 999);

      const weekKey = monday.toISOString().slice(0, 10);
      const weekEndKey = sunday.toISOString().slice(0, 10);

      if (!weekMap[weekKey]) {
        weekMap[weekKey] = { weekStart: weekKey, weekEnd: weekEndKey, total: 0, count: 0, peopleTotal: 0 };
      }
      if (p.status === "confirmed") {
        weekMap[weekKey].total += p.amount;
        weekMap[weekKey].count += 1;
      }
      weekMap[weekKey].peopleTotal += partyForRow(p);

      if (!monthlyMap[monthKey]) {
        monthlyMap[monthKey] = { month: monthKey, total: 0, count: 0, peopleTotal: 0, weeks: [] };
      }
      if (p.status === "confirmed") {
        monthlyMap[monthKey].total += p.amount;
        monthlyMap[monthKey].count += 1;
      }
      monthlyMap[monthKey].peopleTotal += partyForRow(p);
    }

    // Attach weeks to months (a week goes to the month where it starts — i.e. Monday's month)
    for (const week of Object.values(weekMap)) {
      const monthKey = week.weekStart.slice(0, 7);
      if (monthlyMap[monthKey]) {
        monthlyMap[monthKey].weeks.push(week);
      }
    }
    // Sort weeks within each month DESC (most recent first)
    for (const month of Object.values(monthlyMap)) {
      month.weeks.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    }

    const monthlyRevenue = Object.values(monthlyMap).sort((a, b) => b.month.localeCompare(a.month));

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
      monthlyRevenue,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
