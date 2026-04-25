import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

/**
 * Server-local calendar day [start, nextDayStart) — matches `GET .../boss/history`
 * (`todayStart.setHours(0,0,0,0)`), not UTC midnight. Using UTC here made the
 * Payments KPI show 0 while History / session cards (local "today") still looked correct.
 */
function localCalendarDayBounds(d = new Date()) {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const nextDayStart = new Date(start);
  nextDayStart.setDate(nextDayStart.getDate() + 1);
  return { start, nextDayStart };
}

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const now = new Date();
    const { start: todayStart, nextDayStart: todayNext } = localCalendarDayBounds(now);

    const [
      revenue,
      activeSubscribers,
      pendingPayments,
      recentCheckIns,
      courtSessionsToday,
      openCourtSession,
      sessionsOpenedTodayForPayments,
    ] = await Promise.all([
      prisma.pendingPayment.aggregate({
        where: {
          venueId,
          status: "confirmed",
          confirmedAt: { gte: todayStart, lt: todayNext },
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
      prisma.checkInRecord.findMany({
        where: {
          venueId,
          checkedInAt: { gte: todayStart, lt: todayNext },
        },
        include: { player: true },
        orderBy: { checkedInAt: "desc" },
        take: 20,
      }),
      prisma.session.findMany({
        where: {
          venueId,
          openedAt: { gte: todayStart, lt: todayNext },
        },
        orderBy: { openedAt: "desc" },
        take: 20,
        include: {
          _count: { select: { queueEntries: true } },
        },
      }),
      prisma.session.findFirst({
        where: { venueId, status: "open" },
        orderBy: { openedAt: "desc" },
        include: {
          _count: { select: { queueEntries: true } },
        },
      }),
      prisma.session.findMany({
        where: { venueId, openedAt: { gte: todayStart, lt: todayNext } },
        select: { id: true, openedAt: true, closedAt: true },
      }),
    ]);

    /** Same rules as `GET /api/sessions/history` per session; dedupe payment ids across overlapping windows. */
    const seenPaymentIds = new Set<string>();
    let paymentsTodaySessionsTotal = 0;
    for (const s of sessionsOpenedTodayForPayments) {
      const periodEnd = s.closedAt ?? now;
      const periodStart = s.openedAt;
      const payments = await prisma.pendingPayment.findMany({
        where: {
          venueId,
          status: "confirmed",
          OR: [
            { sessionId: s.id },
            {
              checkInPlayerId: { not: null },
              confirmedAt: { gte: periodStart, lte: periodEnd },
            },
          ],
        },
        select: { id: true, amount: true },
      });
      for (const p of payments) {
        if (!seenPaymentIds.has(p.id)) {
          seenPaymentIds.add(p.id);
          paymentsTodaySessionsTotal += p.amount;
        }
      }
    }
    const paymentsTodaySessionsCount = seenPaymentIds.size;

    return NextResponse.json({
      paymentsTodaySessionsTotal,
      paymentsTodaySessionsCount,
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
      courtSessionsToday: courtSessionsToday.map((s) => ({
        id: s.id,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        queuePlayers: s._count.queueEntries,
      })),
      currentCourtSession: openCourtSession
        ? {
            id: openCourtSession.id,
            status: openCourtSession.status,
            openedAt: openCourtSession.openedAt,
            closedAt: openCourtSession.closedAt,
            queuePlayers: openCourtSession._count.queueEntries,
          }
        : null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
