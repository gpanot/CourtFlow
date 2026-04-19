import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  createCheckInPayment,
  createConfirmedCheckInPayment,
  checkInSubscriber,
} from "@/modules/courtpay/lib/check-in";
import { getActiveSubscription, activateSubscription } from "@/modules/courtpay/lib/subscription";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(req: Request) {
  try {
    const { venueCode, playerId, packageId, skipSessionDeduction } = await req.json();

    if (!venueCode || !playerId) {
      return NextResponse.json(
        { error: "venueCode and playerId are required" },
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

    const player = await prisma.checkInPlayer.findUnique({
      where: { id: playerId },
    });
    if (!player || player.venueId !== venue.id) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const openSession = await prisma.session.findFirst({
      where: { venueId: venue.id, status: "open" },
      select: { id: true, openedAt: true, sessionFee: true },
    });

    const sessionStart = openSession?.openedAt ?? (() => {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d;
    })();

    const alreadyCheckedIn = await prisma.checkInRecord.findFirst({
      where: {
        playerId,
        venueId: venue.id,
        checkedInAt: { gte: sessionStart },
      },
    });
    if (alreadyCheckedIn) {
      return NextResponse.json(
        { error: "already_checked_in", alreadyCheckedIn: true, playerName: player.name },
        { status: 409 }
      );
    }

    const existingPayment = await prisma.pendingPayment.findFirst({
      where: {
        checkInPlayerId: playerId,
        venueId: venue.id,
        status: { in: ["pending", "confirmed"] },
        createdAt: { gte: sessionStart },
      },
    });
    if (existingPayment) {
      const allowRenewalAfterZeroCheckIn =
        !!skipSessionDeduction &&
        !!packageId &&
        existingPayment.type === "checkin" &&
        existingPayment.amount === 0 &&
        existingPayment.status === "confirmed";

      if (allowRenewalAfterZeroCheckIn) {
        // Allow one renewal purchase after the zero-amount check-in payment.
        // Keep blocking if a renewal/subscription payment already exists this session.
        const existingRenewalPayment = await prisma.pendingPayment.findFirst({
          where: {
            checkInPlayerId: playerId,
            venueId: venue.id,
            status: { in: ["pending", "confirmed"] },
            createdAt: { gte: sessionStart },
            type: { in: ["subscription", "subscription_renewal"] },
          },
        });
        if (!existingRenewalPayment) {
          // Continue to package purchase flow below.
        } else {
          return NextResponse.json(
            { error: "already_checked_in", alreadyCheckedIn: true, playerName: player.name },
            { status: 409 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "already_checked_in", alreadyCheckedIn: true, playerName: player.name },
          { status: 409 }
        );
      }
    }

    // ── Active subscription (no package purchase) → auto check-in, amount = 0 ──
    const activeSub = await getActiveSubscription(playerId);
    if (activeSub && !packageId) {
      const autoPayment = await createConfirmedCheckInPayment({
        venueId: venue.id,
        playerId,
        amount: 0,
        type: "checkin",
        paymentMethod: "subscription",
        confirmedBy: "system_subscription",
      });
      await checkInSubscriber(playerId, venue.id, activeSub.id, sessionStart, autoPayment.id);

      const updated = await getActiveSubscription(playerId);
      emitToVenue(venue.id, "payment:confirmed", {
        pendingPaymentId: autoPayment.id,
        paymentRef: autoPayment.paymentRef,
        playerName: player.name,
        subscription: updated,
      });
      return NextResponse.json({
        pendingPaymentId: autoPayment.id,
        amount: 0,
        vietQR: null,
        paymentRef: autoPayment.paymentRef,
        subscription: updated,
        checkedIn: true,
      });
    }

    // ── Buying a new package ────────────────────────────────────────────────
    // Keep the payment step (VietQR / cash). The subscription is activated
    // before confirmation, but check-in + session deduction happen only when
    // payment is confirmed by staff/webhook.
    if (packageId) {
      const pkg = await prisma.subscriptionPackage.findFirst({
        where: { id: packageId, venueId: venue.id, isActive: true },
      });
      if (!pkg) {
        return NextResponse.json({ error: "Package not found" }, { status: 404 });
      }

      const payment = await createCheckInPayment({
        venueId: venue.id,
        playerId,
        amount: pkg.price,
        type: skipSessionDeduction ? "subscription_renewal" : "subscription",
        packageId,
      });

      await activateSubscription(playerId, packageId, venue.id, payment.paymentRef);

      return NextResponse.json({
        ...payment,
        checkedIn: false,
      });
    }

    // ── Session-only payment (no subscription) ──────────────────────────────
    const settings = venue.settings as Record<string, unknown>;
    const sessionFee =
      openSession?.sessionFee ?? (settings?.sessionFee as number) ?? 0;

    if (sessionFee > 0) {
      const payment = await createCheckInPayment({
        venueId: venue.id,
        playerId,
        amount: sessionFee,
        type: "checkin",
      });

      return NextResponse.json({ ...payment, checkedIn: false });
    }

    // Free session
    await prisma.checkInRecord.create({
      data: { playerId, venueId: venue.id, source: "cash" },
    });

    return NextResponse.json({
      pendingPaymentId: null,
      amount: 0,
      vietQR: null,
      paymentRef: null,
      checkedIn: true,
    });
  } catch (err) {
    console.error("[courtpay/pay-session]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
