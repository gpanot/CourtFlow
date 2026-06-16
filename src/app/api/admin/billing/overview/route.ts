import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { getCurrentWeekUsage } from "@/lib/billing";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    requireSuperAdmin(req.headers);

    const venues = await prisma.venue.findMany({
      where: { active: true },
      select: { id: true, name: true, billingStatus: true },
      orderBy: { name: "asc" },
    });

    const venueData = await Promise.all(
      venues.map(async (venue) => {
        const [
          usage,
          autoOutstanding, manualOutstanding,
          autoPaid, manualPaid,
        ] = await Promise.all([
            getCurrentWeekUsage(venue.id).catch(() => null),
            prisma.billingInvoice.aggregate({
              where: { venueId: venue.id, status: { in: ["pending", "overdue"] } },
              _sum: { totalAmount: true },
            }),
            prisma.manualBillingInvoice.aggregate({
              where: { venueId: venue.id, status: { in: ["pending", "overdue"] } },
              _sum: { amount: true },
            }),
            prisma.billingInvoice.aggregate({
              where: { venueId: venue.id, status: "paid" },
              _sum: { paidAmount: true, totalAmount: true },
            }),
            prisma.manualBillingInvoice.aggregate({
              where: { venueId: venue.id, status: "paid" },
              _sum: { amount: true },
            }),
          ]);

        const outstandingAmount =
          (autoOutstanding._sum.totalAmount ?? 0) +
          (manualOutstanding._sum.amount ?? 0);

        const paidAmount =
          (autoPaid._sum.paidAmount ?? autoPaid._sum.totalAmount ?? 0) +
          (manualPaid._sum.amount ?? 0);

        return {
          id: venue.id,
          name: venue.name,
          billingStatus: venue.billingStatus,
          thisWeekEstimate: usage?.estimatedTotal ?? 0,
          thisWeekPayments: usage?.totalPayments ?? usage?.totalCheckins ?? 0,
          outstandingAmount,
          paidAmount,
        };
      })
    );

    const totalThisWeek = venueData.reduce((sum, v) => sum + v.thisWeekEstimate, 0);
    const overdueCount = venueData.filter((v) => v.outstandingAmount > 0).length;

    return NextResponse.json({
      venues: venueData,
      summary: {
        activeVenues: venues.length,
        thisWeekRevenue: totalThisWeek,
        overdueCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
