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
 * Also returns 4 KPI stats for the boss stats grid.
 */
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

    const [selfPlayers, courtPayPlayers, venueName] = await Promise.all([
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
          rankingScore: true,
          createdAt: true,
          queueEntries: {
            where: { session: { venueId } },
            orderBy: { joinedAt: "desc" },
            take: 1,
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
            orderBy: { checkedInAt: "desc" },
            take: 1,
            select: { checkedInAt: true },
          },
          _count: { select: { checkIns: true } },
        },
        take: 500,
      }),
      prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } }),
    ]);

    const vname = venueName?.name ?? venueId;

    // Build unified player list
    const players = [
      ...selfPlayers.map((p) => ({
        id: p.id,
        source: "self" as const,
        name: p.name,
        phone: p.phone,
        gender: p.gender ?? null,
        skillLevel: p.skillLevel ?? null,
        facePhotoPath: p.facePhotoPath ?? null,
        avatarPhotoPath: p.avatarPhotoPath ?? null,
        rankingScore: p.rankingScore,
        checkInCount: 0, // Self players don't use CheckInRecord
        lastSeenAt: p.queueEntries[0]?.joinedAt?.toISOString() ?? null,
        registeredAt: p.createdAt.toISOString(),
        venueName: vname,
      })),
      ...courtPayPlayers.map((p) => ({
        id: p.id,
        source: "courtpay" as const,
        name: p.name,
        phone: p.phone,
        gender: p.gender ?? null,
        skillLevel: p.skillLevel ?? null,
        photoUrl: null, // CheckInPlayer has no photo field
        rankingScore: null,
        checkInCount: p._count.checkIns,
        lastSeenAt: p.checkIns[0]?.checkedInAt?.toISOString() ?? null,
        registeredAt: p.createdAt.toISOString(),
        venueName: vname,
      })),
    ];

    // KPI stats
    const totalPlayers = players.length;
    const totalSelf = selfPlayers.length;
    const totalCourtPay = courtPayPlayers.length;
    const newThisWeek = players.filter(
      (p) => new Date(p.registeredAt) >= sevenDaysAgo
    ).length;
    const maleCount = players.filter(
      (p) => p.gender?.toLowerCase() === "male"
    ).length;
    const femaleCount = players.filter(
      (p) => p.gender?.toLowerCase() === "female"
    ).length;

    return NextResponse.json({
      players,
      stats: {
        totalPlayers,
        totalSelf,
        totalCourtPay,
        newThisWeek,
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
