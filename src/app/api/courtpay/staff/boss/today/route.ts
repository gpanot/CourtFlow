import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

/** UTC calendar day [start, end] — matches `toISOString().slice(0, 10)` used in boss history. */
function utcCalendarDayBounds(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const start = new Date(Date.UTC(y, m, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, day, 23, 59, 59, 999));
  return { start, end };
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
    const { start: todayStart, end: todayEnd } = utcCalendarDayBounds(now);

    const [
      checkIns,
      revenue,
      activeSubscribers,
      pendingPayments,
      recentCheckIns,
      courtSessionsToday,
      openCourtSession,
    ] = await Promise.all([
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
      prisma.checkInRecord.findMany({
        where: {
          venueId,
          checkedInAt: { gte: todayStart, lte: todayEnd },
        },
        include: { player: true },
        orderBy: { checkedInAt: "desc" },
        take: 20,
      }),
      prisma.session.findMany({
        where: {
          venueId,
          openedAt: { gte: todayStart, lte: todayEnd },
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
    ]);

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
