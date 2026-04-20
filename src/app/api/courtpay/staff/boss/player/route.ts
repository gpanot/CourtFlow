import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

/**
 * GET /api/courtpay/staff/boss/player?playerId=...&source=courtpay|self
 *
 * Returns detailed profile for a single player including:
 * - Basic info (name, phone, gender, skill, photo)
 * - Active subscription summary
 * - Recent check-in history (last 50)
 * - All-time stats
 */
export async function GET(req: Request) {
  try {
    requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const playerId = searchParams.get("playerId");
    const source = searchParams.get("source") ?? "courtpay";

    if (!playerId) {
      return NextResponse.json({ error: "playerId required" }, { status: 400 });
    }

    if (source === "courtpay") {
      const player = await prisma.checkInPlayer.findUnique({
        where: { id: playerId },
        include: {
          venue: { select: { name: true } },
          checkIns: {
            orderBy: { checkedInAt: "desc" },
            take: 50,
            select: { id: true, checkedInAt: true, source: true },
          },
          subscriptions: {
            orderBy: { activatedAt: "desc" },
            take: 10,
            include: {
              package: { select: { name: true, price: true, sessions: true } },
              usages: { select: { id: true } },
            },
          },
        },
      });

      if (!player) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }

      const activeSub = player.subscriptions.find(
        (s) => s.status === "active" && s.expiresAt > new Date()
      ) ?? null;

      return NextResponse.json({
        player: {
          id: player.id,
          source: "courtpay",
          name: player.name,
          phone: player.phone,
          gender: player.gender,
          skillLevel: player.skillLevel,
          facePhotoPath: null,
          avatarPhotoPath: null,
          venueName: player.venue.name,
          registeredAt: player.createdAt.toISOString(),
          checkInCount: player.checkIns.length,
          checkIns: player.checkIns.map((c) => ({
            id: c.id,
            checkedInAt: c.checkedInAt.toISOString(),
            source: c.source,
          })),
          activeSub: activeSub
            ? {
                id: activeSub.id,
                packageName: activeSub.package.name,
                packagePrice: activeSub.package.price,
                totalSessions: activeSub.package.sessions,
                sessionsRemaining: activeSub.sessionsRemaining,
                sessionsUsed: activeSub.usages.length,
                status: activeSub.status,
                activatedAt: activeSub.activatedAt.toISOString(),
                expiresAt: activeSub.expiresAt.toISOString(),
              }
            : null,
          subscriptionHistory: player.subscriptions.map((s) => ({
            id: s.id,
            packageName: s.package.name,
            status: s.status,
            activatedAt: s.activatedAt.toISOString(),
            expiresAt: s.expiresAt.toISOString(),
            sessionsUsed: s.usages.length,
            totalSessions: s.package.sessions,
          })),
        },
      });
    }

    // source === "self" — Self check-in player
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      include: {
        queueEntries: {
          orderBy: { joinedAt: "desc" },
          take: 50,
          select: {
            id: true,
            joinedAt: true,
            session: { select: { venue: { select: { name: true } } } },
          },
        },
      },
    });

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const venueName = player.queueEntries[0]?.session?.venue?.name ?? "—";

    return NextResponse.json({
      player: {
        id: player.id,
        source: "self",
        name: player.name,
        phone: player.phone,
        gender: player.gender,
        skillLevel: player.skillLevel,
        facePhotoPath: player.facePhotoPath,
        avatarPhotoPath: player.avatarPhotoPath,
        venueName,
        registeredAt: player.createdAt.toISOString(),
        checkInCount: player.queueEntries.length,
        checkIns: player.queueEntries.map((e) => ({
          id: e.id,
          checkedInAt: e.joinedAt.toISOString(),
          source: "self",
        })),
        activeSub: null,
        subscriptionHistory: [],
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
