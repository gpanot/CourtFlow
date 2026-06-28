import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { faceRecognitionService } from "@/lib/face-recognition";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { buildVietQRUrl } from "@/lib/vietqr";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";

export const dynamic = "force-dynamic";
const PAYMENT_TIMEOUT_MS = 3 * 60 * 1000;

export async function POST(request: NextRequest) {
  try {
    const body = await parseBody<{
      venueId: string;
      imageBase64?: string;
      queueNumber?: number;
      playerId?: string;
    }>(request);

    const { venueId, imageBase64, queueNumber, playerId: playerIdInput } = body;
    if (!venueId?.trim()) return error("venueId is required", 400);
    if (!imageBase64?.trim() && queueNumber == null && !playerIdInput?.trim()) {
      return error("imageBase64, queueNumber, or playerId is required", 400);
    }

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });
    if (!session) return error("No active session", 404);

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { name: true, bankName: true, bankAccount: true, bankOwnerName: true, billingStatus: true },
    });
    if (!venue) return error("Venue not found", 404);

    if (venue.billingStatus === "suspended") {
      return error("Service paused. Please contact your venue admin.", 403);
    }

    let playerId: string | null = null;
    let playerName = "";

    if (playerIdInput?.trim()) {
      const player = await prisma.player.findUnique({
        where: { id: playerIdInput.trim() },
        select: { id: true, name: true },
      });
      if (!player) return error("Player not found", 404);
      playerId = player.id;
      playerName = player.name;
    } else if (queueNumber != null) {
      const entry = await prisma.queueEntry.findFirst({
        where: { sessionId: session.id, queueNumber },
        include: { player: true },
      });
      if (!entry) return error("No player found with that wristband number", 404);
      playerId = entry.playerId;
      playerName = entry.player.name;
    } else if (imageBase64) {
      const result = await faceRecognitionService.recognizeFace(imageBase64, {
        venueId,
      });
      if (result.resultType === "matched") {
        playerId = result.playerId!;
        playerName = result.displayName || "";
      } else if (result.resultType === "new_player") {
        const existingByFace =
          result.faceSubjectId
            ? await prisma.player.findFirst({ where: { faceSubjectId: result.faceSubjectId } })
            : null;
        if (existingByFace) {
          playerId = existingByFace.id;
          playerName = existingByFace.name;
        } else {
          return json({
            success: true,
            resultType: "needs_registration",
          });
        }
      } else {
        return json({
          success: true,
          resultType: result.resultType,
          error: result.error,
        });
      }
    }

    if (!playerId) return error("Could not identify player", 400);

    const playerRecord = await prisma.player.findUnique({
      where: { id: playerId },
      select: { name: true, phone: true, skillLevel: true },
    });
    if (!playerRecord) return error("Player not found", 404);
    playerName = playerRecord.name;
    const playerPhone = playerRecord.phone;

    const existingEntry = await prisma.queueEntry.findUnique({
      where: { sessionId_playerId: { sessionId: session.id, playerId } },
    });

    if (existingEntry && ["waiting", "assigned", "playing", "on_break"].includes(existingEntry.status)) {
      const player = await prisma.player.findUnique({ where: { id: playerId }, select: { skillLevel: true } });
      return json({
        success: true,
        resultType: "already_checked_in",
        playerId,
        playerName,
        playerPhone,
        alreadyCheckedIn: true,
        queueNumber: existingEntry.queueNumber,
        skillLevel: player?.skillLevel,
        isReturning: true,
      });
    }

    const amount = session.sessionFee;

    const existingPending = await prisma.pendingPayment.findFirst({
      where: { sessionId: session.id, playerId, status: "pending" },
    });
    if (existingPending) {
      // Ensure stored paymentRef is a proper CF-SES-XXXXXX ref; backfill if it's an old name+date string
      let resumeRef = existingPending.paymentRef;
      if (!resumeRef || !resumeRef.startsWith("CF-SES-")) {
        resumeRef = await generatePaymentRef("session");
        await prisma.pendingPayment.update({
          where: { id: existingPending.id },
          data: { paymentRef: resumeRef },
        });
      }
      const resumeQR = buildVietQRUrl({
        bankBin: venue.bankName || "",
        accountNumber: venue.bankAccount || "",
        accountName: venue.bankOwnerName || "",
        amount: existingPending.amount,
        description: resumeRef,
      });
      return json({
        pendingPaymentId: existingPending.id,
        playerId,
        amount: existingPending.amount,
        vietQR: resumeQR,
        playerName,
        playerPhone,
        skillLevel: playerRecord.skillLevel,
        isReturning: true,
        resuming: true,
        bankBin: venue.bankName,
        bankAccount: venue.bankAccount,
        paymentRef: resumeRef,
      });
    }

    const paymentRef = await generatePaymentRef("session");
    const pendingPayment = await prisma.pendingPayment.create({
      data: {
        venueId,
        sessionId: session.id,
        playerId,
        amount,
        type: "checkin",
        status: "pending",
        expiresAt: new Date(Date.now() + PAYMENT_TIMEOUT_MS),
        paymentRef,
      },
    });

    const vietQR = buildVietQRUrl({
      bankBin: venue.bankName || "",
      accountNumber: venue.bankAccount || "",
      accountName: venue.bankOwnerName || "",
      amount,
      description: paymentRef,
    });

    emitToVenue(venueId, "payment:new", {
      pendingPaymentId: pendingPayment.id,
      playerName,
      amount,
      paymentMethod: "vietqr",
      type: "checkin",
    });

    sendPaymentPushToStaff("payment_new", {
      venueId,
      pendingPaymentId: pendingPayment.id,
      playerName,
      amount,
      paymentMethod: "vietqr",
      type: "checkin",
    });

    return json({
      pendingPaymentId: pendingPayment.id,
      playerId,
      amount,
      vietQR,
      playerName,
      playerPhone,
      skillLevel: playerRecord.skillLevel,
      isReturning: true,
      bankBin: venue.bankName,
      bankAccount: venue.bankAccount,
      paymentRef,
    });
  } catch (e) {
    console.error("[Kiosk Checkin Payment] Error:", e);
    return error((e as Error).message, 500);
  }
}
