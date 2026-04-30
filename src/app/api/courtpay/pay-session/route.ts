import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  clampSessionPartyHeadCount,
  createCheckInPayment,
  createConfirmedCheckInPayment,
  checkInSubscriber,
  updatePendingCheckinSessionPaymentHeadcount,
} from "@/modules/courtpay/lib/check-in";
import {
  getActiveSubscription,
  getLatestSubscription,
  activateSubscription,
} from "@/modules/courtpay/lib/subscription";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { venueCode, playerId, packageId, skipSessionDeduction, headCount: headCountRaw } =
      body as {
        venueCode?: string;
        playerId?: string;
        packageId?: string;
        skipSessionDeduction?: boolean;
        headCount?: unknown;
      };

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
      } else if (
        !packageId &&
        existingPayment.status === "pending" &&
        existingPayment.type === "checkin"
      ) {
        const settingsEarly = venue.settings as Record<string, unknown>;
        let sessionFeeEarly =
          openSession?.sessionFee ?? (settingsEarly?.sessionFee as number) ?? 0;
        if (sessionFeeEarly > 0 && openSession?.id) {
          const corePlayerEarly = await prisma.player.findFirst({ where: { phone: player.phone } });
          if (corePlayerEarly) {
            const sessionEarly = await prisma.session.findUnique({
              where: { id: openSession.id },
              select: { staffId: true },
            });
            if (sessionEarly?.staffId) {
              const discountEarly = await prisma.playerCustomPrice.findUnique({
                where: { playerId_staffId: { playerId: corePlayerEarly.id, staffId: sessionEarly.staffId } },
              });
              if (discountEarly) {
                if (discountEarly.discountType === "fixed" && discountEarly.customFee) {
                  sessionFeeEarly = discountEarly.customFee;
                } else if (discountEarly.discountType === "percent" && discountEarly.discountPct) {
                  sessionFeeEarly = Math.round(sessionFeeEarly * (1 - discountEarly.discountPct / 100));
                }
              }
            }
          }
        }
        if (sessionFeeEarly > 0) {
          const headCount = clampSessionPartyHeadCount(headCountRaw ?? 1);
          const amount = sessionFeeEarly * headCount;
          const updated = await updatePendingCheckinSessionPaymentHeadcount({
            pendingId: existingPayment.id,
            venueId: venue.id,
            amount,
            partyCount: headCount,
          });
          if (updated) {
            return NextResponse.json({ ...updated, checkedIn: false });
          }
        }
        return NextResponse.json(
          { error: "already_checked_in", alreadyCheckedIn: true, playerName: player.name },
          { status: 409 }
        );
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
      const latest = await getLatestSubscription(playerId);
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
        latestSubscription: latest,
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
    let sessionFee =
      openSession?.sessionFee ?? (settings?.sessionFee as number) ?? 0;

    // Apply player discount if one exists
    if (sessionFee > 0 && openSession?.id) {
      const corePlayer = await prisma.player.findFirst({ where: { phone: player.phone } });
      if (corePlayer) {
        const session = await prisma.session.findUnique({
          where: { id: openSession.id },
          select: { staffId: true },
        });
        if (session?.staffId) {
          const discount = await prisma.playerCustomPrice.findUnique({
            where: { playerId_staffId: { playerId: corePlayer.id, staffId: session.staffId } },
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
    }

    if (sessionFee > 0) {
      const headCount = clampSessionPartyHeadCount(headCountRaw ?? 1);
      const payment = await createCheckInPayment({
        venueId: venue.id,
        playerId,
        amount: sessionFee * headCount,
        type: "checkin",
        partyCount: headCount,
        sessionId: openSession?.id,
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
