import { prisma } from "@/lib/db";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";
import { buildVietQRUrl } from "@/lib/vietqr";
import type { PlayerCoachCredit } from "@prisma/client";

export interface CreateCreditPurchaseInput {
  coachId: string;
  packageId: string;
  quantity: number;
  totalPrice: number;
  venueId: string;
}

export interface CreateCreditPurchaseResult {
  credit: PlayerCoachCredit;
  payment: {
    paymentRef: string;
    qrUrl: string | null;
    amount: number;
    bankName: string | null;
    bankAccount: string | null;
    bankOwnerName: string | null;
  };
}

/**
 * Creates a pending credit-package purchase for a player.
 *
 * Writes one PlayerCoachCredit row (paymentStatus="pending") and generates a
 * CF-CR-XXXXXX payment reference for SePay matching. The credit becomes usable
 * only after SePay confirms payment (via webhook) or staff manually approves.
 *
 * Returns the created credit record plus the VietQR payment details for display.
 *
 * No side effects beyond the DB write — no emails, no calendar events.
 * No Next.js or HTTP coupling — accepts playerId and venueId as plain parameters.
 *
 * Throws if the package is not found or if Prisma fails unexpectedly.
 */
export async function createCreditPurchase(
  playerId: string,
  input: CreateCreditPurchaseInput
): Promise<CreateCreditPurchaseResult> {
  const { coachId, packageId, quantity, totalPrice, venueId } = input;

  // Look up by id + coachId only — the client's venueId may differ from the package's stored venue.
  const pkg = await prisma.coachPackage.findFirst({
    where: { id: packageId, coachId, active: true },
    include: { coach: { select: { creditPackageValidityDays: true } } },
  });
  if (!pkg) throw new Error("Package not found");

  const resolvedVenueId = pkg.venueId;

  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: resolvedVenueId },
    select: { bankName: true, bankAccount: true, bankOwnerName: true },
  });

  const paymentRef = await generatePaymentRef("credit");
  const validityDays = pkg.coach.creditPackageValidityDays ?? 90;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + validityDays);

  const credit = await prisma.playerCoachCredit.create({
    data: {
      playerId,
      coachId,
      venueId: resolvedVenueId,
      packageId,
      totalSessions: quantity,
      priceValue: totalPrice,
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

  return {
    credit,
    payment: {
      paymentRef,
      qrUrl,
      amount: totalPrice,
      bankName: venue.bankName,
      bankAccount: venue.bankAccount,
      bankOwnerName: venue.bankOwnerName,
    },
  };
}
