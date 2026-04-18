import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

/**
 * GET /api/courtpay/staff/boss/players?venueId=...
 *
 * Returns combined player list for a venue:
 * - Self Check-In players (Player table, joined via queueEntries → session → venueId)
 * - CourtPay players (CheckInPlayer table, joined via venueId directly)
 *
 * Per player: avgReturnDays (average gap between consecutive check-ins).
 * Stats: totalPlayers, newThisWeek, activeSubscriptions, avgReturnDays (venue-wide).
 */

/** Average gap in days between consecutive sorted dates. Returns null if < 2 visits. */
function calcAvgReturnDays(dates: Date[]): number | null {
  if (dates.length < 2) return null;
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  let totalMs = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalMs += sorted[i].getTime() - sorted[i - 1].getTime();
  }
  const avgMs = totalMs / (sorted.length - 1);
  return Math.round((avgMs / 86_400_000) * 10) / 10; // 1 decimal place
}

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const now = new Date();

    const [selfPlayers, courtPayPlayers, venueName, activeSubscriptions] = await Promise.all([
      // Self Check-In players who have ever joined a queue in this venue
      prisma.player.findMany({
        where: {
          queueEntries: { some: { session: { venueId } } },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          skillLevel: true,
          facePhotoPath: true,
          avatarPhotoPath: true,
          createdAt: true,
          queueEntries: {
            where: { session: { venueId } },
            orderBy: { joinedAt: "asc" },
            select: { joinedAt: true },
          },
        },
        take: 500,
      }),
      // CourtPay players — directly scoped by venueId
      prisma.checkInPlayer.findMany({
        where: { venueId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          skillLevel: true,
          createdAt: true,
          checkIns: {
            orderBy: { checkedInAt: "asc" },
            select: { checkedInAt: true },
          },
          _count: { select: { checkIns: true } },
        },
        take: 500,
      }),
      prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } }),
      // Active subscriptions for this venue
      prisma.playerSubscription.count({
        where: {
          venueId,
          status: "active",
          expiresAt: { gte: now },
        },
      }),
    ]);

    const vname = venueName?.name ?? venueId;

    // Build unified player list with avg return days
    const players = [
      ...selfPlayers.map((p) => {
        const dates = p.queueEntries.map((e) => new Date(e.joinedAt));
        const avgReturn = calcAvgReturnDays(dates);
        const lastSeenAt = dates.length > 0
          ? dates[dates.length - 1].toISOString()
          : null;
        return {
          id: p.id,
          source: "self" as const,
          name: p.name,
          phone: p.phone,
          gender: p.gender ?? null,
          skillLevel: p.skillLevel ?? null,
          facePhotoPath: p.facePhotoPath ?? null,
          avatarPhotoPath: p.avatarPhotoPath ?? null,
          checkInCount: dates.length,
          avgReturnDays: avgReturn,
          lastSeenAt,
          registeredAt: p.createdAt.toISOString(),
          venueName: vname,
        };
      }),
      ...courtPayPlayers.map((p) => {
        const dates = p.checkIns.map((c) => new Date(c.checkedInAt));
        const avgReturn = calcAvgReturnDays(dates);
        const lastSeenAt = dates.length > 0
          ? dates[dates.length - 1].toISOString()
          : null;
        return {
          id: p.id,
          source: "courtpay" as const,
          name: p.name,
          phone: p.phone,
          gender: p.gender ?? null,
          skillLevel: p.skillLevel ?? null,
          facePhotoPath: null,
          avatarPhotoPath: null,
          checkInCount: p._count.checkIns,
          avgReturnDays: avgReturn,
          lastSeenAt,
          registeredAt: p.createdAt.toISOString(),
          venueName: vname,
        };
      }),
    ];

    // KPI stats
    const totalPlayers = players.length;
    const newThisWeek = players.filter(
      (p) => new Date(p.registeredAt) >= sevenDaysAgo
    ).length;
    const maleCount = players.filter(
      (p) => p.gender?.toLowerCase() === "male"
    ).length;
    const femaleCount = players.filter(
      (p) => p.gender?.toLowerCase() === "female"
    ).length;

    // Venue-wide avg return: median of all per-player avgReturnDays that are non-null
    const allAvgs = players
      .map((p) => p.avgReturnDays)
      .filter((v): v is number => v !== null);
    const venueAvgReturn =
      allAvgs.length > 0
        ? Math.round((allAvgs.reduce((a, b) => a + b, 0) / allAvgs.length) * 10) / 10
        : null;

    return NextResponse.json({
      players,
      stats: {
        totalPlayers,
        newThisWeek,
        activeSubscriptions,
        venueAvgReturn,
        maleCount,
        femaleCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
