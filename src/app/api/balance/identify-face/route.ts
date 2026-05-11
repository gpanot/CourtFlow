import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";
import { isRateLimited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (isRateLimited(`balance-face:${ip}`, 10, 60_000)) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { venueCode, imageBase64 } = await req.json();

    if (!imageBase64?.trim()) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 }
      );
    }

    const recognition = await faceRecognitionService.recognizeFace(
      imageBase64,
      venueCode ? { venueId: venueCode } : undefined
    );

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
      return NextResponse.json({ found: false });
    }

    const checkInPlayers = await prisma.checkInPlayer.findMany({
      where: { phone: player.phone },
      include: { venue: { select: { id: true, name: true, active: true } } },
    });

    const activePlayers = checkInPlayers.filter((p) => p.venue.active);

    if (activePlayers.length === 0) {
      return NextResponse.json({ found: false });
    }

    const firstName = activePlayers[0].name.split(" ")[0];
    const venues = activePlayers.map((p) => ({
      id: p.venue.id,
      name: p.venue.name,
    }));

    if (activePlayers.length === 1) {
      const cp = activePlayers[0];
      const payload = await buildBalancePayload(cp, cp.venue);
      return NextResponse.json({ ...payload, phone: player.phone, venues });
    }

    return NextResponse.json({
      found: true,
      playerName: firstName,
      phone: player.phone,
      venues,
    });
  } catch (err) {
    console.error("[balance/identify-face]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function buildBalancePayload(
  player: { id: string; name: string },
  venue: { id: string; name: string }
) {
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

  return {
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
  };
}
