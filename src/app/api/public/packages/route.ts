import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getPortalVenueId } from "@/lib/venue-config";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";
import { buildVietQRUrl } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

const CREDIT_EXPIRY_DAYS = 90;

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const body = await request.json();
    const { coachId, packageId, quantity, totalPrice, venueId: bodyVenueId } = body as {
      coachId: string;
      packageId: string;
      quantity: number;
      totalPrice: number;
      venueId?: string;
    };
    const venueId = bodyVenueId || getPortalVenueId();

    const pkg = await prisma.coachPackage.findFirst({
      where: { id: packageId, coachId, venueId, active: true },
    });
    if (!pkg) return error("Package not found", 404);

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: { bankName: true, bankAccount: true, bankOwnerName: true },
    });

    const paymentRef = await generatePaymentRef("credit");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CREDIT_EXPIRY_DAYS);

    const credit = await prisma.playerCoachCredit.create({
      data: {
        playerId,
        coachId,
        venueId,
        packageId,
        totalSessions: quantity,
        priceInCents: totalPrice,
        paymentRef,
        paymentStatus: "pending",
        expiresAt,
      },
    });

    const qrUrl = buildVietQRUrl({
      bankBin: venue.bankName || "",
      accountNumber: venue.bankAccount || "",
      accountName: venue.bankOwnerName || "",
      amount: totalPrice,
      description: paymentRef,
    });

    return json(
      {
        credit,
        payment: {
          paymentRef,
          qrUrl,
          amount: totalPrice,
          bankName: venue.bankName,
          bankAccount: venue.bankAccount,
          bankOwnerName: venue.bankOwnerName,
        },
      },
      201
    );
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
