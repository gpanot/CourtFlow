import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const venueIds = await getAuthorizedVenueIds(auth);

    if (venueIds.length === 0) {
      return json({ venues: [], invoices: [] });
    }

    const [venues, invoices, rates] = await Promise.all([
      prisma.venue.findMany({
        where: { id: { in: venueIds } },
        select: { id: true, name: true, billingStatus: true },
      }),
      prisma.billingInvoice.findMany({
        where: { venueId: { in: venueIds } },
        include: {
          venue: { select: { id: true, name: true } },
        },
        orderBy: { weekStartDate: "desc" },
        take: 50,
      }),
      prisma.venueBillingRate.findMany({
        where: { venueId: { in: venueIds } },
        select: {
          venueId: true,
          baseRatePerCheckin: true,
          subscriptionAddon: true,
          sepayAddon: true,
          isFreeBase: true,
          isFreeSubAddon: true,
          isFreeSepayAddon: true,
        },
      }),
    ]);

    const ratesByVenue = Object.fromEntries(rates.map((r) => [r.venueId, r]));

    return json({
      venues: venues.map((v) => ({
        ...v,
        rate: ratesByVenue[v.id] ?? null,
      })),
      invoices: invoices.map((inv) => ({
        id: inv.id,
        venueId: inv.venueId,
        venueName: inv.venue.name,
        weekStartDate: inv.weekStartDate,
        weekEndDate: inv.weekEndDate,
        totalCheckins: inv.totalCheckins,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount,
        status: inv.status,
        paidAt: inv.paidAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
