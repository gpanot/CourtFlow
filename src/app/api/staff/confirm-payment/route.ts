import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { faceRecognitionService } from "@/lib/face-recognition";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { pendingPaymentId } = await parseBody<{ pendingPaymentId: string }>(request);
    if (!pendingPaymentId?.trim()) return error("pendingPaymentId is required", 400);

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
      include: { player: true, session: true },
    });
    if (!payment) return error("Payment not found", 404);
    if (payment.status !== "pending") return error("Payment is no longer pending", 400);

    // CourtPay payments may not have sessionId/playerId — just confirm and return
    if (!payment.sessionId || !payment.playerId) {
      await prisma.pendingPayment.update({
        where: { id: pendingPaymentId },
        data: { status: "confirmed", confirmedAt: new Date(), confirmedBy: auth.id },
      });
      emitToVenue(payment.venueId, "payment:confirmed", {
        pendingPaymentId,
        paymentRef: payment.paymentRef,
        playerName: payment.player?.name ?? payment.checkInPlayerId ?? "Unknown",
      });
      sendPaymentPushToStaff("payment_confirmed", {
        venueId: payment.venueId,
        pendingPaymentId,
        playerName: payment.player?.name ?? payment.checkInPlayerId ?? "Unknown",
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
      });
      return json({ queueNumber: null, playerName: payment.player?.name ?? "Unknown" });
    }

    const existingEntry = await prisma.queueEntry.findUnique({
      where: {
        sessionId_playerId: {
          sessionId: payment.sessionId,
          playerId: payment.playerId,
        },
      },
    });

    const queueNumber = existingEntry?.queueNumber
      ?? await faceRecognitionService.getNextQueueNumber(payment.sessionId);

    let queueEntry;
    if (existingEntry) {
      queueEntry = await prisma.queueEntry.update({
        where: { id: existingEntry.id },
        data: { status: "on_break", queueNumber },
        include: { player: true },
      });
    } else {
      queueEntry = await prisma.queueEntry.create({
        data: {
          sessionId: payment.sessionId,
          playerId: payment.playerId,
          status: "on_break",
          queueNumber,
        },
        include: { player: true },
      });
    }

    await prisma.pendingPayment.update({
      where: { id: pendingPaymentId },
      data: {
        status: "confirmed",
        confirmedAt: new Date(),
        confirmedBy: auth.id,
      },
    });

    await prisma.auditLog.create({
      data: {
        venueId: payment.venueId,
        staffId: auth.id,
        action: "payment_confirmed",
        targetId: payment.playerId,
        metadata: {
          pendingPaymentId,
          amount: payment.amount,
          paymentMethod: payment.paymentMethod,
          type: payment.type,
          queueNumber,
        },
      },
    });

    emitToVenue(payment.venueId, "payment:confirmed", {
      pendingPaymentId,
      playerName: payment.player?.name ?? "Unknown",
      queueNumber,
    });
    sendPaymentPushToStaff("payment_confirmed", {
      venueId: payment.venueId,
      pendingPaymentId,
      playerName: payment.player?.name ?? "Unknown",
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
    });

    const allEntries = await prisma.queueEntry.findMany({
      where: { sessionId: payment.sessionId, status: { in: ["waiting", "on_break"] } },
      include: {
        player: true,
        group: { include: { queueEntries: { where: { status: { not: "left" } }, include: { player: true } } } },
      },
      orderBy: { joinedAt: "asc" },
    });
    emitToVenue(payment.venueId, "queue:updated", allEntries);

    return json({
      queueNumber,
      playerName: queueEntry.player.name,
    });
  } catch (e) {
    console.error("[Staff Confirm Payment] Error:", e);
    return error((e as Error).message, 500);
  }
}
