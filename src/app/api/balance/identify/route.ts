import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isRateLimited } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(`balance:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const venueCode = req.nextUrl.searchParams.get("venueCode");
    const phone = req.nextUrl.searchParams.get("phone");

    if (!venueCode || !phone) {
      return NextResponse.json(
        { error: "venueCode and phone are required" },
        { status: 400 }
      );
    }

    const venue = await prisma.venue.findFirst({
      where: { id: venueCode, active: true },
      select: { id: true, name: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const player = await prisma.checkInPlayer.findUnique({
      where: { phone_venueId: { phone: phone.trim(), venueId: venue.id } },
    });

    if (!player) {
      return NextResponse.json({ found: false, venueName: venue.name });
    }

    const activeSub = await prisma.playerSubscription.findFirst({
      where: {
        playerId: player.id,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      include: { package: true, _count: { select: { usages: true } } },
      orderBy: { activatedAt: "desc" },
    });

    const lastCheckInRecord = await prisma.checkInRecord.findFirst({
      where: { playerId: player.id, venueId: venue.id },
      orderBy: { checkedInAt: "desc" },
      select: { checkedInAt: true },
    });

    const totalSessions = await prisma.checkInRecord.count({
      where: { playerId: player.id, venueId: venue.id },
    });

    const firstName = player.name.split(" ")[0];

    const daysRemaining = activeSub
      ? Math.max(0, Math.ceil((activeSub.expiresAt.getTime() - Date.now()) / 86_400_000))
      : 0;

    return NextResponse.json({
      found: true,
      venueName: venue.name,
      playerName: firstName,
      subscription: activeSub
        ? {
            packageName: activeSub.package.name,
            sessionsTotal: activeSub.package.sessions,
            sessionsRemaining: activeSub.sessionsRemaining,
            sessionsUsed: activeSub._count.usages,
            expiresAt: activeSub.expiresAt.toISOString(),
            daysRemaining,
            isUnlimited: activeSub.package.sessions === null,
            isExpiringSoon: daysRemaining <= 7,
          }
        : null,
      lastCheckIn: lastCheckInRecord?.checkedInAt?.toISOString() ?? null,
      totalSessions,
    });
  } catch (err) {
    console.error("[balance/identify]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
