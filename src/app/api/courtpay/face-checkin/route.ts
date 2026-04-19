import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { faceRecognitionService } from "@/lib/face-recognition";
import { getActiveSubscription } from "@/modules/courtpay/lib/subscription";

/**
 * POST /api/courtpay/face-checkin
 *
 * Recognise a face → bridge to CheckInPlayer → return subscription status.
 * Does NOT create a payment or queue entry — the kiosk handles that next.
 */
export async function POST(req: Request) {
  try {
    const { venueId, imageBase64 } = await req.json();
    if (!venueId?.trim() || !imageBase64?.trim()) {
      return NextResponse.json(
        { error: "venueId and imageBase64 are required" },
        { status: 400 }
      );
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const recognition = await faceRecognitionService.recognizeFace(imageBase64);

    if (recognition.resultType === "new_player") {
      if (recognition.faceSubjectId) {
        const byFace = await prisma.player.findFirst({
          where: { faceSubjectId: recognition.faceSubjectId },
          select: { id: true, name: true, phone: true },
        });
        if (byFace) {
          return bridgeToCheckInPlayer(byFace, venue.id);
        }
      }
      return NextResponse.json({ resultType: "needs_registration" });
    }

    if (recognition.resultType === "matched" && recognition.playerId) {
      const player = await prisma.player.findUnique({
        where: { id: recognition.playerId },
        select: { id: true, name: true, phone: true },
      });
      if (!player) {
        return NextResponse.json({ resultType: "needs_registration" });
      }
      return bridgeToCheckInPlayer(player, venue.id);
    }

    // no_face, error, etc.
    return NextResponse.json({
      resultType: recognition.resultType,
      error: recognition.error,
    });
  } catch (e) {
    console.error("[courtpay/face-checkin]", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function bridgeToCheckInPlayer(
  player: { id: string; name: string; phone: string },
  venueId: string
) {
  let checkInPlayer = await prisma.checkInPlayer.findUnique({
    where: { phone_venueId: { phone: player.phone, venueId } },
  });

  if (!checkInPlayer) {
    const fullPlayer = await prisma.player.findUnique({
      where: { id: player.id },
      select: { gender: true, skillLevel: true },
    });
    checkInPlayer = await prisma.checkInPlayer.create({
      data: {
        venueId,
        name: player.name,
        phone: player.phone,
        gender: fullPlayer?.gender || null,
        skillLevel: fullPlayer?.skillLevel || null,
      },
    });
  }

  // Check if the player has already paid (confirmed payment) or has a pending
  // payment in the current session. Return a dedicated resultType so the kiosk
  // can display a clear warning instead of silently passing through.
  const openSession = await prisma.session.findFirst({
    where: { venueId, status: "open" },
    select: { id: true, openedAt: true },
  });
  const sessionStart = openSession?.openedAt ?? (() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  })();

  const existingPayment = await prisma.pendingPayment.findFirst({
    where: {
      checkInPlayerId: checkInPlayer.id,
      venueId,
      status: { in: ["pending", "confirmed"] },
      createdAt: { gte: sessionStart },
    },
    select: { status: true },
  });

  if (existingPayment) {
    return NextResponse.json({
      resultType: "already_paid",
      alreadyPaidStatus: existingPayment.status,
      player: {
        id: checkInPlayer.id,
        name: checkInPlayer.name,
        phone: checkInPlayer.phone,
      },
    });
  }

  const activeSub = await getActiveSubscription(checkInPlayer.id);

  return NextResponse.json({
    resultType: "matched",
    player: {
      id: checkInPlayer.id,
      name: checkInPlayer.name,
      phone: checkInPlayer.phone,
    },
    activeSubscription: activeSub,
  });
}
