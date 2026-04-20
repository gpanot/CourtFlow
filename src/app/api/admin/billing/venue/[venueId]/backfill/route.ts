import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { generateWeeklyInvoice, getWeekBounds } from "@/lib/billing";

/**
 * POST /api/admin/billing/venue/[venueId]/backfill
 *
 * Generates missing invoices for all past weeks that have billable payments
 * but no existing invoice. Useful when a venue was added after the cron
 * first ran or when the cron was missed.
 *
 * Returns a summary of invoices created.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId } = await params;

    await prisma.venue.findUniqueOrThrow({ where: { id: venueId } });

    // Find the earliest confirmed payment for this venue
    const earliest = await prisma.pendingPayment.findFirst({
      where: {
        venueId,
        checkInPlayerId: { not: null },
        status: { in: ["confirmed", "cancelled"] },
        confirmedAt: { not: null },
      },
      orderBy: { confirmedAt: "asc" },
      select: { confirmedAt: true },
    });

    if (!earliest?.confirmedAt) {
      return NextResponse.json({ message: "No billable payments found", created: [] });
    }

    // Collect all week-start dates from earliest payment up to (but not including) current week
    const { weekStart: currentWeekStart } = getWeekBounds();
    const results: { weekStart: string; weekEnd: string; invoiceId: string; totalAmount: number; status: string; payments: number }[] = [];

    const cursor = getWeekBounds(earliest.confirmedAt);
    let weekStart = cursor.weekStart;

    while (weekStart < currentWeekStart) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      try {
        const invoice = await generateWeeklyInvoice(venueId, weekStart, weekEnd);
        results.push({
          weekStart: weekStart.toISOString(),
          weekEnd: weekEnd.toISOString(),
          invoiceId: invoice.id,
          totalAmount: invoice.totalAmount,
          status: invoice.status,
          payments: invoice.totalCheckins,
        });
      } catch (err) {
        console.error(`Backfill: failed for week ${weekStart.toISOString()}`, err);
      }

      // Advance to next week
      weekStart = new Date(weekStart);
      weekStart.setDate(weekStart.getDate() + 7);
    }

    return NextResponse.json({ message: "Backfill complete", created: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
