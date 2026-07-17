import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/suspend-overdue-memberships
 *
 * Daily cron that implements the 7-day grace period rule:
 * When a Membership's latest MembershipPayment is UNPAID or OVERDUE and
 * periodEnd + GRACE_DAYS has passed, set the Membership status to "suspended".
 *
 * This replaces the intent of expireMemberships() (which is dead code — no cron
 * ever called it). The grace-then-suspend rule is now the single authoritative
 * lifecycle process: access stays active for 7 days after the renewal date passes
 * with an unpaid payment, then flips to suspended automatically.
 *
 * sessionsUsed and renewalDate are left unchanged so that reactivation via the
 * existing activate endpoint resumes cleanly.
 *
 * Should run once daily via Railway Cron:
 *   Schedule: 0 2 * * *   (2 AM local time)
 *   Command:  GET https://<your-domain>/api/cron/suspend-overdue-memberships
 *   Header:   Authorization: Bearer $CRON_SECRET
 */

const GRACE_DAYS = 7;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization")?.replace("Bearer ", "");
    const query = request.nextUrl.searchParams.get("secret");
    if (auth !== secret && query !== secret) {
      return error("Unauthorized", 401);
    }
  }

  const now = new Date();
  // A membership is eligible for suspension when its latest payment's periodEnd
  // plus the grace window is already in the past.
  const graceDeadline = new Date(now);
  graceDeadline.setDate(graceDeadline.getDate() - GRACE_DAYS);

  try {
    // Step 1: Mark UNPAID *recurring* payments as OVERDUE when periodEnd has passed.
    // Initiation-fee payments are excluded — they are a one-time charge with periodEnd
    // set to the activation time (always in the past) and should not trigger suspension.
    const overdueResult = await prisma.membershipPayment.updateMany({
      where: {
        status: "UNPAID",
        paymentType: "recurring",
        periodEnd: { lt: now },
      },
      data: { status: "OVERDUE" },
    });

    // Step 2: Find active memberships where the latest RECURRING payment (by periodEnd)
    // is UNPAID or OVERDUE and its periodEnd + GRACE_DAYS is already past.
    // Initiation-fee payments are explicitly excluded from the suspension trigger:
    // their periodEnd equals the activation timestamp and would always match otherwise.
    const eligibleMemberships = await prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT m.id
      FROM memberships m
      INNER JOIN membership_payments mp ON mp.membership_id = m.id
      WHERE m.status = 'active'
        AND mp.payment_type = 'recurring'
        AND mp.status IN ('UNPAID', 'OVERDUE')
        AND mp.period_end < ${graceDeadline}
        AND NOT EXISTS (
          SELECT 1 FROM membership_payments mp2
          WHERE mp2.membership_id = m.id
            AND mp2.payment_type = 'recurring'
            AND mp2.status = 'PAID'
            AND mp2.period_end > mp.period_end
        )
    `;

    const ids = eligibleMemberships.map((r) => r.id);

    let suspendedCount = 0;
    if (ids.length > 0) {
      const result = await prisma.membership.updateMany({
        where: { id: { in: ids } },
        data: { status: "suspended" },
      });
      suspendedCount = result.count;
    }

    return json({
      markedOverdue: overdueResult.count,
      suspended: suspendedCount,
      graceDays: GRACE_DAYS,
      checkedAt: now.toISOString(),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
