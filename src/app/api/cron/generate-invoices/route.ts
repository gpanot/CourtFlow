import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  generateWeeklyInvoice,
  generateMonthlyInvoice,
  getPreviousWeekBounds,
  getPreviousMonthBounds,
} from "@/lib/billing";

export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const isFirstOfMonth = today.getDate() === 1;

    const venues = await prisma.venue.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        billingRate: {
          select: {
            billingModel: true,
            monthlyRate: true,
            monthlyPeriodStart: true,
            monthlyEndDate: true,
            monthlyStatus: true,
          },
        },
      },
    });

    const weeklyResults: { venueId: string; status: string; totalAmount: number }[] = [];
    const monthlyResults: { venueId: string; status: string; totalAmount: number }[] = [];

    const { weekStart, weekEnd } = getPreviousWeekBounds();
    const { monthStart: prevMonthStart, monthEnd: prevMonthEnd } = getPreviousMonthBounds();

    for (const venue of venues) {
      const billingModel = venue.billingRate?.billingModel ?? "per_payment";

      if (billingModel === "monthly") {
        // Monthly invoices are only generated on the 1st of the month
        if (!isFirstOfMonth) continue;

        const monthlyStatus = venue.billingRate?.monthlyStatus ?? "inactive";
        const monthlyEndDate = venue.billingRate?.monthlyEndDate ?? null;

        // Skip cancelled subscriptions — auto-revert to per_payment
        if (monthlyStatus === "cancelled") {
          await prisma.venueBillingRate.update({
            where: { venueId: venue.id },
            data: { billingModel: "per_payment", monthlyStatus: "inactive" },
          });
          continue;
        }

        // Skip expired subscriptions (end date has passed)
        if (monthlyEndDate && prevMonthEnd > monthlyEndDate) {
          await prisma.venueBillingRate.update({
            where: { venueId: venue.id },
            data: { billingModel: "per_payment", monthlyStatus: "inactive" },
          });
          continue;
        }

        try {
          const monthlyPeriodStart = venue.billingRate?.monthlyPeriodStart ?? null;

          let periodStart = prevMonthStart;
          if (
            monthlyPeriodStart &&
            monthlyPeriodStart >= prevMonthStart &&
            monthlyPeriodStart <= prevMonthEnd
          ) {
            periodStart = new Date(monthlyPeriodStart);
            periodStart.setHours(0, 0, 0, 0);
          }

          const invoice = await generateMonthlyInvoice(venue.id, periodStart, prevMonthEnd);
          monthlyResults.push({
            venueId: venue.id,
            status: invoice.status,
            totalAmount: invoice.totalAmount,
          });
        } catch (err) {
          console.error(`Failed to generate monthly invoice for venue ${venue.id}:`, err);
          monthlyResults.push({ venueId: venue.id, status: "error", totalAmount: 0 });
        }
      } else {
        // per_payment venues: weekly invoices (unchanged behaviour)
        try {
          const invoice = await generateWeeklyInvoice(venue.id, weekStart, weekEnd);
          weeklyResults.push({
            venueId: venue.id,
            status: invoice.status,
            totalAmount: invoice.totalAmount,
          });
        } catch (err) {
          console.error(`Failed to generate invoice for venue ${venue.id}:`, err);
          weeklyResults.push({ venueId: venue.id, status: "error", totalAmount: 0 });
        }
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
      weeklyInvoicesGenerated: weeklyResults.length,
      monthlyInvoicesGenerated: monthlyResults.length,
      overdueMarked: overdueInvoices.count,
      venuesSuspended: venuesToSuspend.length,
      weeklyResults,
      monthlyResults,
    });
  } catch (err) {
    console.error("Cron generate-invoices error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
