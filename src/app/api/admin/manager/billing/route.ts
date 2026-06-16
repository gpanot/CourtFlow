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

    const [venues, invoices, manualInvoices, rates] = await Promise.all([
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
      prisma.manualBillingInvoice.findMany({
        where: { venueId: { in: venueIds } },
        include: {
          venue: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "desc" },
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
          billingModel: true,
          monthlyRate: true,
          monthlyPeriodStart: true,
          monthlyEndDate: true,
          monthlyStatus: true,
        },
      }),
    ]);

    const ratesByVenue = Object.fromEntries(rates.map((r) => [r.venueId, r]));

    // Normalise auto-generated invoices
    const autoRows = invoices.map((inv) => ({
      id: inv.id,
      kind: "auto" as const,
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
      // manual-only fields
      dueDate: null,
      pdfUrl: null,
      notes: null,
      invoiceType: inv.invoiceType,
    }));

    // Normalise manually-created invoices
    const manualRows = manualInvoices.map((inv) => ({
      id: inv.id,
      kind: "manual" as const,
      venueId: inv.venueId,
      venueName: inv.venue.name,
      weekStartDate: inv.dueDate,   // reuse weekStartDate slot for sorting
      weekEndDate: inv.dueDate,
      totalCheckins: 0,
      totalAmount: inv.amount,
      paidAmount: inv.amount,
      status: inv.status,
      paidAt: inv.paidAt,
      createdAt: inv.createdAt,
      dueDate: inv.dueDate,
      pdfUrl: inv.pdfUrl,
      notes: inv.notes,
      invoiceType: "manual",
    }));

    // Merge and sort by date descending, cap at 50
    const allRows = [...autoRows, ...manualRows]
      .sort((a, b) => new Date(b.weekStartDate).getTime() - new Date(a.weekStartDate).getTime())
      .slice(0, 50);

    return json({
      venues: venues.map((v) => ({
        ...v,
        rate: ratesByVenue[v.id] ?? null,
      })),
      invoices: allRows,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
