import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { faceRecognitionService } from "@/lib/face-recognition";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { buildVietQRUrl } from "@/lib/vietqr";
import { persistPlayerCheckInFacePhoto } from "@/lib/persist-player-check-in-photo";
import { COLLECTION_ID, FACE_MATCH_THRESHOLD } from "@/lib/rekognition-config";
import { saveSignupDuplicatePhoto } from "@/lib/save-signup-duplicate-photo";

const PAYMENT_TIMEOUT_MS = 3 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<{
      venueId: string;
      imageBase64: string;
      name: string;
      phone: string;
      gender: "male" | "female" | "other";
      skillLevel: "beginner" | "intermediate" | "advanced";
    }>(request);

    const { venueId, imageBase64, name, phone, gender, skillLevel } = body;
    if (!venueId?.trim() || !imageBase64?.trim() || !name?.trim() || !phone?.trim() || !gender || !skillLevel) {
      return error("venueId, imageBase64, name, phone, gender, and skillLevel are required", 400);
    }

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });
    if (!session) return error("No active session", 404);

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { name: true, bankName: true, bankAccount: true, bankOwnerName: true },
    });
    if (!venue) return error("Venue not found", 404);

    const amount = session.sessionFee;

    // Prevent duplicate face registration: check if this face is already enrolled
    const faceCheck = await faceRecognitionService.recognizeFace(imageBase64);
    if (faceCheck.resultType === "matched" && faceCheck.playerId) {
      // Log this duplicate detection for admin review before rejecting
      try {
        const dupLog = await prisma.signupDuplicateLog.create({
          data: {
            matchedPlayerId: faceCheck.playerId,
            newPlayerName: name.trim() || null,
            newPlayerPhone: phone.trim() || null,
            similarityScore: faceCheck.confidence ?? null,
            threshold: FACE_MATCH_THRESHOLD,
            source: "kiosk",
            venueId,
            awsDetail: (faceCheck.attemptMeta ?? faceCheck.recognitionDebug ?? undefined) as never,
          },
        });
        await saveSignupDuplicatePhoto(dupLog.id, imageBase64).catch(() => null);
        const photoPath = `/uploads/signup-duplicates/${dupLog.id}.jpg`;
        await prisma.signupDuplicateLog.update({
          where: { id: dupLog.id },
          data: { newPlayerPhotoPath: photoPath },
        });
        console.warn("[kiosk/register] Signup duplicate logged", {
          logId: dupLog.id,
          matchedPlayerId: faceCheck.playerId,
          similarity: faceCheck.confidence,
        });
      } catch (logErr) {
        console.error("[kiosk/register] Failed to log signup duplicate:", logErr);
      }
      return error("This face is already registered. Please use Check In instead.", 409);
    }

    // Check if phone number already exists
    const existingPlayer = await prisma.player.findUnique({
      where: { phone: phone.trim() },
    });
    if (existingPlayer) {
      return error("This phone number is already registered. Please use Check In instead.", 409);
    }

    const player = await prisma.player.create({
      data: {
        name: name.trim(),
        phone: phone.trim(),
        gender,
        skillLevel,
        registrationAt: new Date(),
        registrationVenueId: venueId,
      },
    });

    console.log("[kiosk/register] Enrolling face in collection", {
      collectionId: COLLECTION_ID,
      playerId: player.id,
      source: "kiosk_register",
    });
    const enrollment = await faceRecognitionService.enrollFace(imageBase64, player.id);
    if (!enrollment.success) {
      // Non-blocking — player can still proceed to payment even without face enrollment.
      console.warn("[kiosk/register] Non-blocking face enrollment failure:", {
        playerId: player.id,
        error: enrollment.error ?? null,
        qualityError: enrollment.qualityError === true,
      });
    }

    try {
      await persistPlayerCheckInFacePhoto(player.id, imageBase64);
    } catch {
      // Non-critical — continue
    }

    const pendingPayment = await prisma.pendingPayment.create({
      data: {
        venueId,
        sessionId: session.id,
        playerId: player.id,
        amount,
        type: "registration",
        status: "pending",
        expiresAt: new Date(Date.now() + PAYMENT_TIMEOUT_MS),
      },
    });

    const today = new Date().toISOString().slice(0, 10);
    const vietQR = buildVietQRUrl({
      bankBin: venue.bankName || "",
      accountNumber: venue.bankAccount || "",
      accountName: venue.bankOwnerName || "",
      amount,
      description: `${name.trim()} NEW ${today}`,
    });

    emitToVenue(venueId, "payment:new", {
      pendingPaymentId: pendingPayment.id,
      playerName: player.name,
      amount,
      paymentMethod: "vietqr",
      type: "registration",
    });

    sendPaymentPushToStaff("payment_new", {
      venueId,
      pendingPaymentId: pendingPayment.id,
      playerName: player.name,
      amount,
      paymentMethod: "vietqr",
      type: "registration",
    });

    return json({
      pendingPaymentId: pendingPayment.id,
      playerId: player.id,
      amount,
      vietQR,
      playerName: player.name,
      playerPhone: player.phone,
      bankBin: venue.bankName,
      bankAccount: venue.bankAccount,
    });
  } catch (e) {
    console.error("[Kiosk Register] Error:", e);
    return error((e as Error).message, 500);
  }
}
