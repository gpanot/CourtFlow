import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  registerPlayer,
  createCheckInPayment,
  clampSessionPartyHeadCount,
} from "@/modules/courtpay/lib/check-in";
import { activateSubscription } from "@/modules/courtpay/lib/subscription";
import { faceRecognitionService } from "@/lib/face-recognition";
import { persistPlayerCheckInFacePhoto } from "@/lib/persist-player-check-in-photo";
import { COLLECTION_ID } from "@/lib/rekognition-config";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      venueCode,
      name,
      phone,
      gender,
      skillLevel,
      packageId,
      imageBase64,
      headCount: headCountRaw,
    } = body as {
      venueCode?: string;
      name?: string;
      phone?: string;
      gender?: string;
      skillLevel?: string;
      packageId?: string;
      imageBase64?: string;
      headCount?: unknown;
    };

    const nameTrimmed = typeof name === "string" ? name.trim() : "";
    const phoneNorm = typeof phone === "string" ? phone.trim() : "";
    /** Unique placeholder so CheckInPlayer @@unique([phone, venueId]) and Player.phone @unique stay valid when phone is omitted. */
    const internalPhone = phoneNorm || `__cp_${randomUUID().replace(/-/g, "")}`;

    if (!venueCode || !nameTrimmed) {
      return NextResponse.json(
        { error: "venueCode and name are required" },
        { status: 400 }
      );
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

    const existingCheckIn = phoneNorm
      ? await prisma.checkInPlayer.findUnique({
          where: { phone_venueId: { phone: phoneNorm, venueId: venue.id } },
        })
      : null;
    if (existingCheckIn) {
      // Check if already checked in this session
      const openSession = await prisma.session.findFirst({
        where: { venueId: venue.id, status: "open" },
        select: { openedAt: true },
      });
      const sessionStart = openSession?.openedAt ?? (() => {
        const d = new Date(); d.setHours(0, 0, 0, 0); return d;
      })();
      const alreadyCheckedIn = await prisma.checkInRecord.findFirst({
        where: { playerId: existingCheckIn.id, venueId: venue.id, checkedInAt: { gte: sessionStart } },
      });
      if (alreadyCheckedIn) {
        return NextResponse.json(
          { error: "already_checked_in", alreadyCheckedIn: true, playerName: existingCheckIn.name },
          { status: 409 }
        );
      }
      // Also block if they have a pending or confirmed payment this session
      const existingPayment = await prisma.pendingPayment.findFirst({
        where: {
          checkInPlayerId: existingCheckIn.id,
          venueId: venue.id,
          status: { in: ["pending", "confirmed"] },
          createdAt: { gte: sessionStart },
        },
      });
      if (existingPayment) {
        return NextResponse.json(
          { error: "already_checked_in", alreadyCheckedIn: true, playerName: existingCheckIn.name },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Player already registered", playerId: existingCheckIn.id },
        { status: 409 }
      );
    }

    // If face image provided, also create/link a Player record for face recognition
    if (imageBase64?.trim()) {
      const faceCheck = await faceRecognitionService.recognizeFace(imageBase64);
      if (faceCheck.resultType === "matched" && faceCheck.playerId) {
        return NextResponse.json(
          { error: "This face is already registered. Please use Check In instead." },
          { status: 409 }
        );
      }

      const existingByPhone = phoneNorm
        ? await prisma.player.findUnique({
            where: { phone: phoneNorm },
          })
        : null;

      if (existingByPhone) {
        if (!existingByPhone.faceSubjectId) {
          console.log("[courtpay/register] Enrolling face in collection", {
            collectionId: COLLECTION_ID,
            playerId: existingByPhone.id,
            source: "existing_player_by_phone",
          });
          const enrollExisting = await faceRecognitionService.enrollFace(
            imageBase64,
            existingByPhone.id
          );
          if (!enrollExisting.success) {
            return NextResponse.json(
              {
                error: enrollExisting.error || "Face enrollment failed",
                qualityError: enrollExisting.qualityError === true,
              },
              { status: 400 }
            );
          }
          try {
            await persistPlayerCheckInFacePhoto(existingByPhone.id, imageBase64);
          } catch { /* non-critical */ }
        }
      } else {
        const genderVal = gender === "male" || gender === "female" ? gender : "male";
        const skillVal = skillLevel === "beginner" || skillLevel === "intermediate" || skillLevel === "advanced"
          ? skillLevel : "beginner";

        const corePlayer = await prisma.player.create({
          data: {
            name: nameTrimmed,
            phone: internalPhone,
            gender: genderVal,
            skillLevel: skillVal,
          },
        });
        console.log("[courtpay/register] Enrolling face in collection", {
          collectionId: COLLECTION_ID,
          playerId: corePlayer.id,
          source: "new_core_player",
        });
        const enrollment = await faceRecognitionService.enrollFace(imageBase64, corePlayer.id);
        if (!enrollment.success) {
          await prisma.player.delete({ where: { id: corePlayer.id } });
          return NextResponse.json(
            {
              error: enrollment.error || "Face enrollment failed",
              qualityError: enrollment.qualityError === true,
            },
            { status: 400 }
          );
        }

        try {
          await persistPlayerCheckInFacePhoto(corePlayer.id, imageBase64);
        } catch { /* non-critical */ }
      }
    }

    const player = await registerPlayer({
      venueId: venue.id,
      name: nameTrimmed,
      phone: internalPhone,
      gender,
      skillLevel,
    });

    if (packageId) {
      const pkg = await prisma.subscriptionPackage.findFirst({
        where: { id: packageId, venueId: venue.id, isActive: true },
      });
      if (!pkg) {
        return NextResponse.json({ error: "Package not found" }, { status: 404 });
      }

      const payment = await createCheckInPayment({
        venueId: venue.id,
        playerId: player.id,
        amount: pkg.price,
        type: "subscription",
        packageId,
      });

      await activateSubscription(
        player.id,
        packageId,
        venue.id,
        payment.paymentRef
      );

      return NextResponse.json({
        playerId: player.id,
        playerName: player.name,
        ...payment,
      });
    }

    // Session-only payment: align with Self Check-In by using open session fee first.
    const openSession = await prisma.session.findFirst({
      where: { venueId: venue.id, status: "open" },
      select: { sessionFee: true },
    });
    const settings = venue.settings as Record<string, unknown>;
    const sessionFee =
      openSession?.sessionFee ?? (settings?.sessionFee as number) ?? 0;

    if (sessionFee > 0) {
      const headCount = clampSessionPartyHeadCount(headCountRaw ?? 1);
      const payment = await createCheckInPayment({
        venueId: venue.id,
        playerId: player.id,
        amount: sessionFee * headCount,
        type: "checkin",
        partyCount: headCount,
      });

      return NextResponse.json({
        playerId: player.id,
        playerName: player.name,
        ...payment,
      });
    }

    // Free session
    await prisma.checkInRecord.create({
      data: {
        playerId: player.id,
        venueId: venue.id,
        source: "cash",
      },
    });

    return NextResponse.json({
      playerId: player.id,
      playerName: player.name,
      pendingPaymentId: null,
      amount: 0,
      vietQR: null,
      paymentRef: null,
    });
  } catch (err) {
    console.error("[courtpay/register]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
