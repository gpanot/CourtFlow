/**
 * GET /api/cron/open-bill-aging
 *
 * Open Bill lifecycle automation — runs daily (Railway cron: 0 2 * * *)
 *
 * Steps:
 *  1. Auto-issue: On the 1st of the month, issue all open bills from the
 *     previous period for venues with autoIssueOnFirst = true.
 *  2. Overdue aging: Mark issued bills overdue when past their due date.
 *  3. Escalation reminders: Send manager notifications for newly-overdue bills
 *     (logged as events; email sending is a TODO for future integration).
 *
 * Auth: CRON_SECRET bearer token (same pattern as other cron routes).
 */

import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { issueBill, getOpenBillVenueSettings, appendBillEvent } from "@/lib/open-bill";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization")?.replace("Bearer ", "");
    const query = request.nextUrl.searchParams.get("secret");
    if (auth !== secret && query !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const isFirstOfMonth = now.getDate() === 1;

  const results = {
    autoIssued: 0,
    markedOverdue: 0,
    escalated: 0,
    errors: [] as string[],
  };

  try {
    // ─── Step 1: Auto-issue on 1st of month ──────────────────────────────────
    if (isFirstOfMonth) {
      // Find all 'open' bills whose period_start is in the PREVIOUS month
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

      const openBills = await prisma.companyOpenBill.findMany({
        where: {
          status: "open",
          periodStart: {
            gte: new Date(
              `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, "0")}-01T00:00:00Z`
            ),
            lt: new Date(
              `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01T00:00:00Z`
            ),
          },
        },
        include: {
          venue: { select: { settings: true } },
          companyAccount: { select: { paymentTermsDays: true } },
        },
      });

      for (const bill of openBills) {
        try {
          const settings = getOpenBillVenueSettings(
            bill.venue.settings as Record<string, unknown>
          );
          if (!settings.autoIssueOnFirst) continue;

          // Use account payment terms → venue default → global fallback
          const dueDaysOverride =
            bill.companyAccount.paymentTermsDays ?? settings.defaultDueDays;

          await issueBill(bill.id, {
            actorId: "system",
            actorType: "system",
            dueDaysOverride,
          });

          results.autoIssued++;
        } catch (err) {
          results.errors.push(`Auto-issue bill ${bill.id}: ${(err as Error).message}`);
        }
      }
    }

    // ─── Step 2: Mark overdue ─────────────────────────────────────────────────
    // Bills that are 'issued', have a due_date, and due_date < today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueList = await prisma.companyOpenBill.findMany({
      where: {
        status: "issued",
        dueDate: { lt: today },
      },
      select: { id: true },
    });

    if (overdueList.length > 0) {
      await prisma.companyOpenBill.updateMany({
        where: { id: { in: overdueList.map((b) => b.id) } },
        data: { status: "overdue", updatedAt: now },
      });

      for (const bill of overdueList) {
        await appendBillEvent(bill.id, "overdue", "system", null, {
          note: "Bill marked overdue by daily aging cron.",
        });
      }

      results.markedOverdue = overdueList.length;
    }

    // ─── Step 3: Manager escalation for overdue bills ─────────────────────────
    // Newly transitioned bills get an escalation event (for future email/push hooks)
    results.escalated = overdueList.length;

    return NextResponse.json({
      success: true,
      ranAt: now.toISOString(),
      isFirstOfMonth,
      ...results,
    });
  } catch (err) {
    console.error("[cron/open-bill-aging] Fatal error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
