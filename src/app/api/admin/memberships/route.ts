import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const tierId = request.nextUrl.searchParams.get("tierId");
    const status = request.nextUrl.searchParams.get("status");
    const paymentFilter = request.nextUrl.searchParams.get("paymentStatus");

    const memberships = await prisma.membership.findMany({
      where: {
        venueId,
        ...(tierId && { tierId }),
        ...(status && { status: status as "active" | "suspended" | "expired" | "cancelled" }),
      },
      include: {
        player: { select: { id: true, name: true, phone: true, avatar: true } },
        tier: { select: { id: true, name: true, sessionsIncluded: true, showBadge: true, priceInCents: true } },
        payments: {
          orderBy: { periodStart: "desc" },
          take: 1,
        },
      },
      orderBy: { activatedAt: "desc" },
    });

    const now = new Date();
    const result = memberships.map((m) => {
      const latestPayment = m.payments[0] || null;
      let currentPaymentStatus: string | null = null;
      if (latestPayment) {
        if (latestPayment.status === "UNPAID" && latestPayment.periodEnd < now) {
          currentPaymentStatus = "OVERDUE";
        } else {
          currentPaymentStatus = latestPayment.status;
        }
      }
      return {
        ...m,
        payments: undefined,
        latestPayment: latestPayment ? { ...latestPayment, status: currentPaymentStatus } : null,
        currentPaymentStatus,
      };
    });

    const filtered = paymentFilter
      ? result.filter((m) => m.currentPaymentStatus === paymentFilter)
      : result;

    const allPaymentsThisMonth = await prisma.membershipPayment.findMany({
      where: {
        membership: { venueId },
        periodStart: {
          gte: new Date(now.getFullYear(), now.getMonth(), 1),
        },
      },
    });

    const paymentSummary = {
      totalCollected: allPaymentsThisMonth
        .filter((p) => p.status === "PAID")
        .reduce((sum, p) => sum + p.amountInCents, 0),
      unpaidCount: allPaymentsThisMonth.filter((p) => p.status === "UNPAID").length,
      unpaidAmount: allPaymentsThisMonth
        .filter((p) => p.status === "UNPAID")
        .reduce((sum, p) => sum + p.amountInCents, 0),
      overdueCount: allPaymentsThisMonth.filter((p) =>
        p.status === "UNPAID" && p.periodEnd < now
      ).length + allPaymentsThisMonth.filter((p) => p.status === "OVERDUE").length,
    };

    return json({ memberships: filtered, paymentSummary });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
