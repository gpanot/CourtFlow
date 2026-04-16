import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createCheckInPayment, checkInSubscriber } from "@/modules/courtpay/lib/check-in";
import { getActiveSubscription, activateSubscription } from "@/modules/courtpay/lib/subscription";

export async function POST(req: Request) {
  try {
    const { venueCode, playerId, packageId } = await req.json();

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

    const player = await prisma.checkInPlayer.findUnique({
      where: { id: playerId },
    });
    if (!player || player.venueId !== venue.id) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    // Check for active subscription (auto check-in, skip payment)
    const activeSub = await getActiveSubscription(playerId);
    if (activeSub && !packageId) {
      await checkInSubscriber(playerId, venue.id, activeSub.id);

      const updated = await getActiveSubscription(playerId);
      return NextResponse.json({
        pendingPaymentId: null,
        amount: 0,
        vietQR: null,
        paymentRef: null,
        subscription: updated,
        checkedIn: true,
      });
    }

    // Subscribing to a package
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
        type: "subscription",
        packageId,
      });

      await activateSubscription(playerId, packageId, venue.id, payment.paymentRef);

      return NextResponse.json({
        ...payment,
        checkedIn: false,
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
