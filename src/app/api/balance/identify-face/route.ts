import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";
import { isRateLimited } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(`balance-face:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { venueCode, imageBase64 } = await req.json();

    if (!venueCode?.trim() || !imageBase64?.trim()) {
      return NextResponse.json(
        { error: "venueCode and imageBase64 are required" },
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

    const recognition = await faceRecognitionService.recognizeFace(imageBase64);

    let player: { id: string; name: string; phone: string } | null = null;

    if (recognition.resultType === "matched" && recognition.playerId) {
      const dbPlayer = await prisma.player.findUnique({
        where: { id: recognition.playerId },
        select: { id: true, name: true, phone: true },
      });
      if (dbPlayer) player = dbPlayer;
    }

    if (!player && recognition.resultType === "new_player" && recognition.faceSubjectId) {
      const byFace = await prisma.player.findFirst({
        where: { faceSubjectId: recognition.faceSubjectId },
        select: { id: true, name: true, phone: true },
      });
      if (byFace) player = byFace;
    }

    if (!player) {
      return NextResponse.json({ found: false, venueName: venue.name });
    }

    const checkInPlayer = await prisma.checkInPlayer.findUnique({
      where: { phone_venueId: { phone: player.phone, venueId: venue.id } },
    });

    if (!checkInPlayer) {
      return NextResponse.json({ found: false, venueName: venue.name });
    }

    const activeSub = await prisma.playerSubscription.findFirst({
      where: {
        playerId: checkInPlayer.id,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      include: { package: true, _count: { select: { usages: true } } },
      orderBy: { activatedAt: "desc" },
    });

    const lastCheckInRecord = await prisma.checkInRecord.findFirst({
      where: { playerId: checkInPlayer.id, venueId: venue.id },
      orderBy: { checkedInAt: "desc" },
      select: { checkedInAt: true },
    });

    const totalSessions = await prisma.checkInRecord.count({
      where: { playerId: checkInPlayer.id, venueId: venue.id },
    });

    const firstName = checkInPlayer.name.split(" ")[0];

    const daysRemaining = activeSub
      ? Math.max(0, Math.ceil((activeSub.expiresAt.getTime() - Date.now()) / 86_400_000))
      : 0;

    return NextResponse.json({
      found: true,
      venueName: venue.name,
      playerName: firstName,
      phone: checkInPlayer.phone,
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
    console.error("[balance/identify-face]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
