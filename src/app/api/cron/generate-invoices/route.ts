import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateWeeklyInvoice, getPreviousWeekBounds } from "@/lib/billing";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { weekStart, weekEnd } = getPreviousWeekBounds();
    const venues = await prisma.venue.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });

    const results: { venueId: string; status: string; totalAmount: number }[] =
      [];

    for (const venue of venues) {
      try {
        const invoice = await generateWeeklyInvoice(
          venue.id,
          weekStart,
          weekEnd
        );
        results.push({
          venueId: venue.id,
          status: invoice.status,
          totalAmount: invoice.totalAmount,
        });
      } catch (err) {
        console.error(
          `Failed to generate invoice for venue ${venue.id}:`,
          err
        );
        results.push({ venueId: venue.id, status: "error", totalAmount: 0 });
      }
    }

    // Mark overdue: pending invoices older than 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const overdueInvoices = await prisma.billingInvoice.updateMany({
      where: {
        status: "pending",
        createdAt: { lt: sevenDaysAgo },
      },
      data: { status: "overdue" },
    });

    // Suspend venues with invoices overdue > 14 days (7 days overdue after 7 days pending)
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const venuesToSuspend = await prisma.billingInvoice.findMany({
      where: {
        status: "overdue",
        createdAt: { lt: fourteenDaysAgo },
      },
      select: { venueId: true },
      distinct: ["venueId"],
    });

    if (venuesToSuspend.length > 0) {
      await prisma.venue.updateMany({
        where: {
          id: { in: venuesToSuspend.map((v) => v.venueId) },
          billingStatus: "active",
        },
        data: { billingStatus: "suspended" },
      });
    }

    return NextResponse.json({
      success: true,
      invoicesGenerated: results.length,
      overdueMarked: overdueInvoices.count,
      venuesSuspended: venuesToSuspend.length,
      results,
    });
  } catch (err) {
    console.error("Cron generate-invoices error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
