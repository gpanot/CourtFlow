import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { getCurrentWeekUsage } from "@/lib/billing";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId } = await params;

    const [venue, rates, invoices, usage] = await Promise.all([
      prisma.venue.findUniqueOrThrow({
        where: { id: venueId },
        select: { id: true, name: true, billingStatus: true },
      }),
      prisma.venueBillingRate.findUnique({
        where: { venueId },
        select: {
          baseRatePerCheckin: true,
          subscriptionAddon: true,
          sepayAddon: true,
          isFreeBase: true,
          isFreeSubAddon: true,
          isFreeSepayAddon: true,
        },
      }),
      prisma.billingInvoice.findMany({
        where: { venueId },
        orderBy: { weekStartDate: "desc" },
        select: {
          id: true,
          weekStartDate: true,
          weekEndDate: true,
          totalCheckins: true,
          totalAmount: true,
          status: true,
          paymentRef: true,
          paidAt: true,
          confirmedBy: true,
        },
      }),
      getCurrentWeekUsage(venueId).catch(() => null),
    ]);

    return NextResponse.json({
      venue,
      rates,
      currentWeek: usage
        ? {
            ...usage,
            totalPayments: usage.totalPayments ?? usage.totalCheckins,
          }
        : null,
      invoices,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
