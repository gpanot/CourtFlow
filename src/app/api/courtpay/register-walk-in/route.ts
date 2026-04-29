import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  registerPlayer,
  createCheckInPayment,
  clampSessionPartyHeadCount,
} from "@/modules/courtpay/lib/check-in";
import { generateWalkInSyntheticPhone } from "@/lib/walk-in-phone";

async function createWalkInPlayerWithUniquePhone(input: {
  name: string;
  gender: "male" | "female";
  skillLevel: "beginner" | "intermediate" | "advanced";
  venueId: string;
}) {
  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const fakePhone = generateWalkInSyntheticPhone();
    let corePlayerId: string | null = null;
    try {
      const corePlayer = await prisma.player.create({
        data: {
          name: input.name,
          phone: fakePhone,
          gender: input.gender,
          skillLevel: input.skillLevel,
          faceSubjectId: null,
          isWalkIn: true,
        },
      });
      corePlayerId = corePlayer.id;
      const checkInPlayer = await registerPlayer({
        venueId: input.venueId,
        name: input.name,
        phone: fakePhone,
        gender: input.gender,
        skillLevel: input.skillLevel,
      });
      return checkInPlayer;
    } catch (err) {
      // Prisma unique violation; retry with a fresh timestamp.
      if ((err as { code?: string }).code === "P2002") {
        if (corePlayerId) {
          await prisma.player.delete({ where: { id: corePlayerId } }).catch(() => {});
        }
        await new Promise((resolve) => setTimeout(resolve, 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Could not generate unique walk-in phone. Please retry.");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { venueCode, name, gender, skillLevel, headCount: headCountRaw } = body as {
      venueCode?: string;
      name?: string;
      gender?: string;
      skillLevel?: string;
      headCount?: unknown;
    };

    const nameTrimmed = typeof name === "string" ? name.trim() : "";
    if (!venueCode || !nameTrimmed || (gender !== "male" && gender !== "female")) {
      return NextResponse.json(
        { error: "venueCode, name, and gender are required" },
        { status: 400 }
      );
    }
    if (
      skillLevel !== "beginner" &&
      skillLevel !== "intermediate" &&
      skillLevel !== "advanced"
    ) {
      return NextResponse.json({ error: "Invalid skillLevel" }, { status: 400 });
    }

    const venue = await prisma.venue.findFirst({
      where: { id: venueCode, active: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }
    if (venue.billingStatus === "suspended") {
      return NextResponse.json(
        { error: "Service paused. Please contact your venue admin.", code: "VENUE_SUSPENDED" },
        { status: 403 }
      );
    }

    const checkInPlayer = await createWalkInPlayerWithUniquePhone({
      venueId: venue.id,
      name: nameTrimmed,
      gender,
      skillLevel,
    });

    const openSession = await prisma.session.findFirst({
      where: { venueId: venue.id, status: "open" },
      select: { sessionFee: true },
    });
    const settings = venue.settings as Record<string, unknown>;
    const sessionFee = openSession?.sessionFee ?? (settings?.sessionFee as number) ?? 0;

    if (sessionFee > 0) {
      const headCount = clampSessionPartyHeadCount(headCountRaw ?? 1);
      const payment = await createCheckInPayment({
        venueId: venue.id,
        playerId: checkInPlayer.id,
        amount: sessionFee * headCount,
        type: "checkin",
        partyCount: headCount,
      });

      return NextResponse.json({
        playerId: checkInPlayer.id,
        playerName: checkInPlayer.name,
        ...payment,
      });
    }

    await prisma.checkInRecord.create({
      data: {
        playerId: checkInPlayer.id,
        venueId: venue.id,
        source: "cash",
      },
    });

    return NextResponse.json({
      playerId: checkInPlayer.id,
      playerName: checkInPlayer.name,
      pendingPaymentId: null,
      amount: 0,
      vietQR: null,
      paymentRef: null,
    });
  } catch (err) {
    console.error("[courtpay/register-walk-in]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
