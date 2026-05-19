/**
 * Creates the overdue billing invoice for Papaya Bangkok (the sessions already exist).
 *
 * Usage: DATABASE_URL="<production_url>" npx tsx scripts/seed-billing-test-invoice.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const venueId = "cmmip73zf0001t5zecvil6q7s"; // Papaya Bangkok

  const now = new Date();
  const todayDay = now.getDay();
  const daysSinceMonday = todayDay === 0 ? 6 : todayDay - 1;

  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - daysSinceMonday);
  thisMonday.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisMonday);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
  lastWeekEnd.setHours(23, 59, 59, 999);

  console.log(`Week: ${lastWeekStart.toDateString()} → ${lastWeekEnd.toDateString()}`);

  const existing = await prisma.billingInvoice.findUnique({
    where: {
      venueId_weekStartDate: {
        venueId,
        weekStartDate: lastWeekStart,
      },
    },
  });

  if (existing) {
    console.log(`Invoice already exists: ${existing.id} (${existing.status}) — ${existing.totalAmount} VND`);
    if (existing.status !== "overdue") {
      await prisma.billingInvoice.update({
        where: { id: existing.id },
        data: { status: "overdue", totalAmount: 5000 },
      });
      console.log("✅ Updated to overdue with 5,000 VND");
    } else {
      console.log("Already overdue — nothing to do.");
    }
  } else {
    const weekNum = getWeekNumber(lastWeekStart);
    const year = lastWeekStart.getFullYear();
    const ref = `CF-BILL-PAPA-${year}W${String(weekNum).padStart(2, "0")}`;

    const invoice = await prisma.billingInvoice.create({
      data: {
        venueId,
        weekStartDate: lastWeekStart,
        weekEndDate: lastWeekEnd,
        totalCheckins: 1,
        subscriptionCheckins: 0,
        sepayCheckins: 0,
        baseAmount: 5000,
        subscriptionAmount: 0,
        sepayAmount: 0,
        totalAmount: 5000,
        status: "overdue",
        paymentRef: ref,
      },
    });
    console.log(`✅ Invoice created: ${invoice.id} — ${ref} — 5,000 VND OVERDUE`);
  }

  // Verify
  const overdueCount = await prisma.billingInvoice.count({
    where: { venueId, status: "overdue" },
  });
  console.log(`\n🔒 Overdue invoices for Papaya Bangkok: ${overdueCount}`);
  console.log(overdueCount > 0
    ? "✅ hasOverdueBilling = true — tabs will be blocked"
    : "⚠️  No overdue invoices — tabs will NOT be blocked"
  );
}

function getWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
