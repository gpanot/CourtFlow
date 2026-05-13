import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueStickerJobIfNeeded } from "@/lib/sticker-queue";
import {
  registerPlayer,
  createCheckInPayment,
  clampSessionPartyHeadCount,
} from "@/modules/courtpay/lib/check-in";
import { activateSubscription } from "@/modules/courtpay/lib/subscription";
import { faceRecognitionService } from "@/lib/face-recognition";
import { persistPlayerCheckInFacePhoto } from "@/lib/persist-player-check-in-photo";
import { COLLECTION_ID, FACE_MATCH_THRESHOLD } from "@/lib/rekognition-config";
import { saveSignupDuplicatePhoto } from "@/lib/save-signup-duplicate-photo";


export const dynamic = "force-dynamic";
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
      reclubUserId: reclubUserIdRaw,
    } = body as {
      venueCode?: string;
      name?: string;
      phone?: string;
      gender?: string;
      skillLevel?: string;
      packageId?: string;
      imageBase64?: string;
      headCount?: unknown;
      reclubUserId?: number;
    };

    const reclubUserId = typeof reclubUserIdRaw === "number" ? reclubUserIdRaw : undefined;

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
      console.info("[courtpay/register][enroll-flow] aws_check_start", {
        venueId: venue.id,
        hasPhone: Boolean(phoneNorm),
        imageBytes: Buffer.byteLength(imageBase64, "base64"),
      });
      const faceCheck = await faceRecognitionService.recognizeFace(imageBase64);
      console.info("[courtpay/register][enroll-flow] aws_check_result", {
        resultType: faceCheck.resultType,
        matchedPlayerId: faceCheck.playerId ?? null,
      });
      if (faceCheck.resultType === "matched" && faceCheck.playerId) {
        // Log this duplicate detection for admin review before rejecting
        try {
          const dupLog = await prisma.signupDuplicateLog.create({
            data: {
              matchedPlayerId: faceCheck.playerId,
              newPlayerName: nameTrimmed || null,
              newPlayerPhone: phoneNorm || null,
              similarityScore: faceCheck.confidence ?? null,
              threshold: FACE_MATCH_THRESHOLD,
              source: "courtpay",
              venueId: venue.id,
            awsDetail: (faceCheck.attemptMeta ?? faceCheck.recognitionDebug ?? undefined) as never,
            },
          });
          await saveSignupDuplicatePhoto(dupLog.id, imageBase64).catch(() => null);
          const photoPath = `/uploads/signup-duplicates/${dupLog.id}.jpg`;
          await prisma.signupDuplicateLog.update({
            where: { id: dupLog.id },
            data: { newPlayerPhotoPath: photoPath },
          });
          console.warn("[courtpay/register] Signup duplicate logged", {
            logId: dupLog.id,
            matchedPlayerId: faceCheck.playerId,
            similarity: faceCheck.confidence,
          });
        } catch (logErr) {
          console.error("[courtpay/register] Failed to log signup duplicate:", logErr);
        }
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
        if (reclubUserId && !existingByPhone.reclubUserId) {
          await prisma.player.update({ where: { id: existingByPhone.id }, data: { reclubUserId } });
        }
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
          console.info("[courtpay/register][enroll-flow] enrollment_final_result", {
            playerId: existingByPhone.id,
            source: "existing_player_by_phone",
            enrolled: enrollExisting.success === true,
            error: enrollExisting.error ?? null,
            qualityError: enrollExisting.qualityError === true,
          });
          if (!enrollExisting.success) {
            // Non-blocking — player can still proceed to payment even without face enrollment.
            console.warn("[courtpay/register] Non-blocking face enrollment failure (existing):", {
              playerId: existingByPhone.id,
              error: enrollExisting.error ?? null,
              qualityError: enrollExisting.qualityError === true,
            });
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
            registrationAt: new Date(),
            registrationVenueId: venue.id,
            ...(reclubUserId ? { reclubUserId } : {}),
          },
        });
        console.log("[courtpay/register] Enrolling face in collection", {
          collectionId: COLLECTION_ID,
          playerId: corePlayer.id,
          source: "new_core_player",
        });
        const enrollment = await faceRecognitionService.enrollFace(imageBase64, corePlayer.id);
        console.info("[courtpay/register][enroll-flow] enrollment_final_result", {
          playerId: corePlayer.id,
          source: "new_core_player",
          enrolled: enrollment.success === true,
          error: enrollment.error ?? null,
          qualityError: enrollment.qualityError === true,
        });
        if (!enrollment.success) {
          // After auto-retry with background removal inside enrollFace(), a remaining
          // "no face" failure means the photo is genuinely unusable.  Do NOT block
          // registration — the player can still pay and be approved by staff.
          // They will appear as "no face" in the admin panel for manual re-enrollment later.
          console.warn("[courtpay/register] Non-blocking face enrollment failure (new):", {
            playerId: corePlayer.id,
            error: enrollment.error ?? null,
            qualityError: enrollment.qualityError === true,
          });
        }

        try {
          await persistPlayerCheckInFacePhoto(corePlayer.id, imageBase64);
        } catch { /* non-critical */ }

        enqueueStickerJobIfNeeded(corePlayer.id, corePlayer.gender).catch(console.error);
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
      select: { id: true, sessionFee: true, staffId: true },
    });
    const settings = venue.settings as Record<string, unknown>;
    let sessionFee =
      openSession?.sessionFee ?? (settings?.sessionFee as number) ?? 0;

    // Apply player discount if one exists
    if (sessionFee > 0 && openSession?.staffId) {
      const corePlayer = await prisma.player.findFirst({ where: { phone: player.phone } });
      if (corePlayer) {
        const discount = await prisma.playerCustomPrice.findUnique({
          where: { playerId_staffId: { playerId: corePlayer.id, staffId: openSession.staffId } },
        });
        if (discount) {
          if (discount.discountType === "fixed" && discount.customFee) {
            sessionFee = discount.customFee;
          } else if (discount.discountType === "percent" && discount.discountPct) {
            sessionFee = Math.round(sessionFee * (1 - discount.discountPct / 100));
          }
        }
      }
    }

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
