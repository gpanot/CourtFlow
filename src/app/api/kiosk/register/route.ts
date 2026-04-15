import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { faceRecognitionService } from "@/lib/face-recognition";
import { emitToVenue } from "@/lib/socket-server";
import { buildVietQRUrl } from "@/lib/vietqr";
import { persistPlayerCheckInFacePhoto } from "@/lib/persist-player-check-in-photo";

const PAYMENT_TIMEOUT_MS = 3 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<{
      venueId: string;
      imageBase64: string;
      name: string;
      gender: "male" | "female" | "other";
      skillLevel: "beginner" | "intermediate" | "advanced";
    }>(request);

    const { venueId, imageBase64, name, gender, skillLevel } = body;
    if (!venueId?.trim() || !imageBase64?.trim() || !name?.trim() || !gender || !skillLevel) {
      return error("venueId, imageBase64, name, gender, and skillLevel are required", 400);
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

    const player = await prisma.player.create({
      data: {
        name: name.trim(),
        phone: `kiosk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        gender,
        skillLevel,
      },
    });

    const enrollment = await faceRecognitionService.enrollFace(imageBase64, player.id);
    if (!enrollment.success) {
      await prisma.player.delete({ where: { id: player.id } });
      return error(enrollment.error || "Face enrollment failed", 400);
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

    return json({
      pendingPaymentId: pendingPayment.id,
      playerId: player.id,
      amount,
      vietQR,
      playerName: player.name,
      bankName: venue.bankName,
      bankAccount: venue.bankAccount,
      bankOwnerName: venue.bankOwnerName,
    });
  } catch (e) {
    console.error("[Kiosk Register] Error:", e);
    return error((e as Error).message, 500);
  }
}
