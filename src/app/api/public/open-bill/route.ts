/**
 * GET /api/public/open-bill
 *
 * Returns the authenticated player's open bill status for the current venue:
 * - Current open bill (running total and bookings)
 * - Historical bills (issued, paid, overdue)
 *
 * Used by the player portal "Open Bill" tab / dashboard.
 */

import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { getPortalVenueId } from "@/lib/venue-config";
import { toDateKey } from "@/lib/date";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const venueId = request.nextUrl.searchParams.get("venueId") || getPortalVenueId();

    // Find the player's company account membership
    const membership = await prisma.companyAccountPlayer.findFirst({
      where: {
        playerId,
        companyAccount: { venueId, isActive: true },
      },
      include: {
        companyAccount: {
          select: {
            id: true,
            name: true,
            isSolo: true,
            vatPercent: true,
            priceVatMode: true,
          },
        },
      },
    });

    if (!membership) {
      return json({ hasOpenBill: false, account: null, currentBill: null, history: [] });
    }

    const companyAccountId = membership.companyAccountId;

    // Current open bill
    const currentBill = await prisma.companyOpenBill.findFirst({
      where: { companyAccountId, status: "open" },
      include: {
        bookings: {
          include: { court: { select: { label: true } } },
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
        },
      },
      orderBy: { periodStart: "desc" },
    });

    // Bill history (issued / paid / overdue)
    const history = await prisma.companyOpenBill.findMany({
      where: {
        companyAccountId,
        status: { not: "open" },
      },
      orderBy: { periodStart: "desc" },
      select: {
        id: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        totalAmount: true,
        invoiceNumber: true,
        paymentRef: true,
        issuedAt: true,
        paidAt: true,
        dueDate: true,
        voidReason: true,
      },
    });

    const currentBillData = currentBill
      ? {
          id: currentBill.id,
          periodStart: currentBill.periodStart.toISOString(),
          periodEnd: currentBill.periodEnd?.toISOString() ?? null,
          subtotal: currentBill.subtotal,
          totalAmount: currentBill.totalAmount,
          bookingCount: currentBill.bookings.length,
          bookings: currentBill.bookings.map((b) => ({
            id: b.id,
            date: toDateKey(b.date),
            startTime: b.startTime.toISOString(),
            endTime: b.endTime.toISOString(),
            courtLabel: b.court.label,
            priceValue: b.priceValue,
            status: b.status,
            paymentStatus: b.paymentStatus,
          })),
        }
      : null;

    return json({
      hasOpenBill: true,
      account: {
        id: membership.companyAccount.id,
        name: membership.companyAccount.name,
        isSolo: membership.companyAccount.isSolo,
      },
      currentBill: currentBillData,
      history: history.map((b) => ({
        id: b.id,
        status: b.status,
        periodStart: b.periodStart.toISOString(),
        periodEnd: b.periodEnd?.toISOString() ?? null,
        totalAmount: b.totalAmount,
        invoiceNumber: b.invoiceNumber,
        paymentRef: b.paymentRef,
        issuedAt: b.issuedAt?.toISOString() ?? null,
        paidAt: b.paidAt?.toISOString() ?? null,
        dueDate: b.dueDate?.toISOString() ?? null,
        voidReason: b.voidReason,
      })),
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
