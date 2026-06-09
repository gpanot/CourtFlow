import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { buildVietQRUrl } from "@/lib/vietqr";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";

export const dynamic = "force-dynamic";

function readVenueFlags(settings: unknown): { autoPaymentEnabled: boolean; sepayEnabled: boolean } {
  const s = (settings ?? {}) as Record<string, unknown>;
  return {
    autoPaymentEnabled: s.autoPaymentEnabled === true,
    sepayEnabled: s.sepayEnabled === true,
  };
}

/**
 * POST /api/admin/courtpay-payment-test
 * Creates a Sepay test pending payment (no player side-effects).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const body = await parseBody<{ venueId: string; amount?: number }>(request);
    const venueId = body.venueId?.trim();
    const amount = Number.isFinite(body.amount) ? Math.max(1000, Math.floor(body.amount!)) : 1000;

    if (!venueId) return error("venueId is required", 400);
    await assertVenueAccess(auth, venueId);

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        bankName: true,
        bankAccount: true,
        bankOwnerName: true,
        settings: true,
      },
    });
    if (!venue) return error("Venue not found", 404);
    if (!venue.bankName || !venue.bankAccount) {
      return error("Venue bank settings are required before generating a test QR", 400);
    }

    const paymentRef = await generatePaymentRef("session");
    const pending = await prisma.pendingPayment.create({
      data: {
        venueId,
        amount,
        paymentRef,
        type: "checkin",
        status: "pending",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
      select: {
        id: true,
        amount: true,
        paymentRef: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    const vietQR = buildVietQRUrl({
      bankBin: venue.bankName,
      accountNumber: venue.bankAccount,
      accountName: venue.bankOwnerName || "",
      amount: pending.amount,
      description: pending.paymentRef || "",
    });

    const flags = readVenueFlags(venue.settings);
    return json({
      pendingPaymentId: pending.id,
      paymentRef: pending.paymentRef,
      amount: pending.amount,
      status: pending.status,
      createdAt: pending.createdAt,
      expiresAt: pending.expiresAt,
      vietQR,
      bankBin: venue.bankName,
      bankAccount: venue.bankAccount,
      autoPaymentEnabled: flags.autoPaymentEnabled,
      sepayEnabled: flags.sepayEnabled,
      debugHint:
        flags.autoPaymentEnabled && flags.sepayEnabled
          ? "Auto-payment + Sepay are ON. If Sepay receives this transfer with the same ref/amount, payment should auto-confirm."
          : "Auto-payment or Sepay is OFF. Webhook may arrive but this test will stay pending until manual confirmation.",
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

/**
 * GET /api/admin/courtpay-payment-test?venueId=...&pendingPaymentId=...
 * Fetches live debug status for a Sepay test pending payment.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId")?.trim();
    const pendingPaymentId = request.nextUrl.searchParams.get("pendingPaymentId")?.trim();

    if (!venueId) return error("venueId is required", 400);
    if (!pendingPaymentId) return error("pendingPaymentId is required", 400);
    await assertVenueAccess(auth, venueId);

    const [payment, venue] = await Promise.all([
      prisma.pendingPayment.findFirst({
        where: { id: pendingPaymentId, venueId },
        select: {
          id: true,
          paymentRef: true,
          amount: true,
          status: true,
          paymentMethod: true,
          confirmedBy: true,
          createdAt: true,
          confirmedAt: true,
          expiresAt: true,
          cancelReason: true,
          cancelledAt: true,
        },
      }),
      prisma.venue.findUnique({
        where: { id: venueId },
        select: { settings: true },
      }),
    ]);

    if (!payment) return error("Test payment not found", 404);
    const flags = readVenueFlags(venue?.settings);

    return json({
      pendingPaymentId: payment.id,
      paymentRef: payment.paymentRef,
      amount: payment.amount,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      confirmedBy: payment.confirmedBy,
      createdAt: payment.createdAt,
      confirmedAt: payment.confirmedAt,
      expiresAt: payment.expiresAt,
      cancelReason: payment.cancelReason,
      cancelledAt: payment.cancelledAt,
      autoPaymentEnabled: flags.autoPaymentEnabled,
      sepayEnabled: flags.sepayEnabled,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
