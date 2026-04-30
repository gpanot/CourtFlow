import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { sendPaymentPushToStaff } from "@/lib/staff-push";
import { faceRecognitionService } from "@/lib/face-recognition";
import { checkInSubscriber } from "@/modules/courtpay/lib/check-in";
import { getActiveSubscription } from "@/modules/courtpay/lib/subscription";

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { pendingPaymentId } = await parseBody<{ pendingPaymentId: string }>(request);
    if (!pendingPaymentId?.trim()) return error("pendingPaymentId is required", 400);

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: pendingPaymentId },
      include: { player: true, session: true, checkInPlayer: true },
    });
    if (!payment) return error("Payment not found", 404);
    if (payment.status !== "pending") return error("Payment is no longer pending", 400);

    // CourtPay payments (no sessionId/playerId on the regular session)
    if (!payment.sessionId || !payment.playerId) {
      // Link to the currently open session so the Reclub snapshot can match this payment.
      const openSession = await prisma.session.findFirst({
        where: { venueId: payment.venueId, status: "open" },
        select: { id: true },
      });

      await prisma.pendingPayment.update({
        where: { id: pendingPaymentId },
        data: {
          status: "confirmed",
          confirmedAt: new Date(),
          confirmedBy: auth.id,
          ...(openSession ? { sessionId: openSession.id } : {}),
        },
      });

      let updatedSub: Awaited<ReturnType<typeof getActiveSubscription>> = null;
      if (payment.checkInPlayerId) {
        if (payment.type === "subscription") {
          // Package purchase: after payment confirmation, check-in now and deduct 1 session.
          const activeSub = await prisma.playerSubscription.findFirst({
            where: {
              playerId: payment.checkInPlayerId,
              status: "active",
              expiresAt: { gt: new Date() },
            },
            orderBy: { activatedAt: "desc" },
          });
          if (activeSub) {
            await checkInSubscriber(
              payment.checkInPlayerId,
              payment.venueId,
              activeSub.id,
              payment.createdAt
            );
          }
          updatedSub = await getActiveSubscription(payment.checkInPlayerId);
        } else if (payment.type === "subscription_renewal") {
          // Renewal flow: activate package after payment, but do not consume a session.
          // We only create the check-in record for this visit.
          await prisma.checkInRecord.create({
            data: {
              playerId: payment.checkInPlayerId,
              venueId: payment.venueId,
              paymentId: pendingPaymentId,
              source: "subscription",
            },
          });
          updatedSub = await getActiveSubscription(payment.checkInPlayerId);
        } else {
          // Single-session (checkin) payment: create a CheckInRecord on confirmation.
          const source = payment.paymentMethod === "cash" ? "cash" : "vietqr";
          await prisma.checkInRecord.create({
            data: {
              playerId: payment.checkInPlayerId,
              venueId: payment.venueId,
              paymentId: pendingPaymentId,
              source,
            },
          });
        }
      }

      const playerName = payment.checkInPlayer?.name ?? payment.checkInPlayerId ?? "Unknown";
      emitToVenue(payment.venueId, "payment:confirmed", {
        pendingPaymentId,
        paymentRef: payment.paymentRef,
        playerName,
        subscription: updatedSub,
      });
      sendPaymentPushToStaff("payment_confirmed", {
        venueId: payment.venueId,
        pendingPaymentId,
        playerName,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
      });
      return json({ queueNumber: null, playerName });
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
