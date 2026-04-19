import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { getCurrentWeekUsage } from "@/lib/billing";

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
        const [usage, latestInvoice] = await Promise.all([
          getCurrentWeekUsage(venue.id).catch(() => null),
          prisma.billingInvoice.findFirst({
            where: { venueId: venue.id },
            orderBy: { weekStartDate: "desc" },
            select: { status: true, totalAmount: true },
          }),
        ]);

        const outstanding = await prisma.billingInvoice.aggregate({
          where: {
            venueId: venue.id,
            status: { in: ["pending", "overdue"] },
          },
          _sum: { totalAmount: true },
        });

        return {
          id: venue.id,
          name: venue.name,
          billingStatus: venue.billingStatus,
          thisWeekEstimate: usage?.estimatedTotal ?? 0,
          thisWeekCheckins: usage?.totalCheckins ?? 0,
          latestInvoiceStatus: latestInvoice?.status ?? null,
          outstandingAmount: outstanding._sum.totalAmount ?? 0,
        };
      })
    );

    const totalThisWeek = venueData.reduce(
      (sum, v) => sum + v.thisWeekEstimate,
      0
    );
    const overdueCount = venueData.filter(
      (v) => v.latestInvoiceStatus === "overdue"
    ).length;

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
