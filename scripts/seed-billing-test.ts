/**
 * Creates test data for billing overdue gating on the live server:
 * - 2 past sessions for staff 942463789 at Papaya Bangkok
 * - 1 session per week for the last 2 weeks
 * - 1 pending billing payment of 5000 VND (overdue)
 *
 * Usage: DATABASE_URL="<production_url>" npx tsx scripts/seed-billing-test.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Looking up venue and staff...\n");

  // Find Papaya Bangkok venue
  const venues = await prisma.venue.findMany({
    select: { id: true, name: true, billingStatus: true },
  });
  console.log("All venues:", venues.map((v) => `${v.name} (${v.id}) billing=${v.billingStatus}`).join("\n  "));

  const venue = venues.find(
    (v) => v.name.toLowerCase().includes("papaya") && v.name.toLowerCase().includes("bang")
  );
  if (!venue) {
    console.error("❌ No venue matching 'Papaya Bangkok' found.");
    return;
  }
  console.log(`\n✅ Venue: ${venue.name} (${venue.id})`);

  // Find staff member by phone
  const staff = await prisma.staffMember.findFirst({
    where: { phone: "942463789" },
    select: { id: true, name: true, phone: true },
  });
  if (!staff) {
    // Try with different phone format
    const allStaff = await prisma.staffMember.findMany({
      where: {
        venueAssignments: { some: { venueId: venue.id } },
      },
      select: { id: true, name: true, phone: true },
    });
    console.log(
      "\n📋 Staff at this venue:",
      allStaff.map((s) => `${s.name} (${s.phone})`).join(", ")
    );
    console.error("❌ No staff with phone 942463789 found.");
    return;
  }
  console.log(`✅ Staff: ${staff.name} (${staff.phone})`);

  // Calculate week boundaries (Mon-Sun) for last 2 weeks
  const now = new Date();
  const todayDay = now.getDay(); // 0=Sun, 1=Mon...
  const daysSinceMonday = todayDay === 0 ? 6 : todayDay - 1;

  // This week's Monday
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - daysSinceMonday);
  thisMonday.setHours(0, 0, 0, 0);

  // Last week: Monday to Sunday
  const lastWeekStart = new Date(thisMonday);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(lastWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() + 6);
  lastWeekEnd.setHours(23, 59, 59, 999);

  // 2 weeks ago: Monday to Sunday
  const twoWeeksAgoStart = new Date(lastWeekStart);
  twoWeeksAgoStart.setDate(twoWeeksAgoStart.getDate() - 7);
  const twoWeeksAgoEnd = new Date(twoWeeksAgoStart);
  twoWeeksAgoEnd.setDate(twoWeeksAgoEnd.getDate() + 6);
  twoWeeksAgoEnd.setHours(23, 59, 59, 999);

  console.log(`\n📅 Week 1 (2 weeks ago): ${twoWeeksAgoStart.toDateString()} → ${twoWeeksAgoEnd.toDateString()}`);
  console.log(`📅 Week 2 (last week): ${lastWeekStart.toDateString()} → ${lastWeekEnd.toDateString()}`);

  // Create session for 2 weeks ago (Wednesday of that week)
  const session1Date = new Date(twoWeeksAgoStart);
  session1Date.setDate(session1Date.getDate() + 2); // Wednesday
  session1Date.setHours(18, 0, 0, 0);

  const session1CloseDate = new Date(session1Date);
  session1CloseDate.setHours(21, 0, 0, 0);

  console.log(`\n📝 Creating session 1 on ${session1Date.toDateString()} 18:00–21:00...`);
  const session1 = await prisma.session.create({
    data: {
      venueId: venue.id,
      staffId: staff.id,
      date: session1Date,
      openedAt: session1Date,
      closedAt: session1CloseDate,
      status: "closed",
      type: "open_play",
      title: "Test Session (billing test)",
      sessionFee: 50000,
    },
  });
  console.log(`  ✅ Session 1 created: ${session1.id}`);

  // Create a confirmed payment for session 1 (so billing has something to charge)
  const payment1 = await prisma.pendingPayment.create({
    data: {
      venueId: venue.id,
      sessionId: session1.id,
      amount: 50000,
      type: "checkin",
      status: "confirmed",
      paymentMethod: "cash",
      confirmedAt: session1Date,
      confirmedBy: "manual",
      expiresAt: new Date(session1Date.getTime() + 30 * 60 * 1000),
    },
  });
  console.log(`  ✅ Payment 1 created: ${payment1.id} (50,000 VND cash)`);

  // Create session for last week (Wednesday of that week)
  const session2Date = new Date(lastWeekStart);
  session2Date.setDate(session2Date.getDate() + 2); // Wednesday
  session2Date.setHours(18, 0, 0, 0);

  const session2CloseDate = new Date(session2Date);
  session2CloseDate.setHours(21, 0, 0, 0);

  console.log(`\n📝 Creating session 2 on ${session2Date.toDateString()} 18:00–21:00...`);
  const session2 = await prisma.session.create({
    data: {
      venueId: venue.id,
      staffId: staff.id,
      date: session2Date,
      openedAt: session2Date,
      closedAt: session2CloseDate,
      status: "closed",
      type: "open_play",
      title: "Test Session 2 (billing test)",
      sessionFee: 50000,
    },
  });
  console.log(`  ✅ Session 2 created: ${session2.id}`);

  const payment2 = await prisma.pendingPayment.create({
    data: {
      venueId: venue.id,
      sessionId: session2.id,
      amount: 50000,
      type: "checkin",
      status: "confirmed",
      paymentMethod: "cash",
      confirmedAt: session2Date,
      confirmedBy: "manual",
      expiresAt: new Date(session2Date.getTime() + 30 * 60 * 1000),
    },
  });
  console.log(`  ✅ Payment 2 created: ${payment2.id} (50,000 VND cash)`);

  // Create a billing invoice for last week — overdue with 5,000 VND
  console.log("\n📝 Creating overdue billing invoice (5,000 VND)...");

  // Check if invoice already exists for this week
  const existingInvoice = await prisma.billingInvoice.findUnique({
    where: {
      venueId_weekStartDate: {
        venueId: venue.id,
        weekStartDate: lastWeekStart,
      },
    },
  });

  if (existingInvoice) {
    console.log(`  ⚠️  Invoice already exists for last week: ${existingInvoice.id} (${existingInvoice.status})`);
    if (existingInvoice.status !== "overdue") {
      await prisma.billingInvoice.update({
        where: { id: existingInvoice.id },
        data: { status: "overdue", totalAmount: 5000 },
      });
      console.log(`  ✅ Updated to overdue with 5,000 VND`);
    }
  } else {
    const weekNum = getWeekNumber(lastWeekStart);
    const year = lastWeekStart.getFullYear();
    const ref = `CF-BILL-PAPA-${year}W${String(weekNum).padStart(2, "0")}`;

    const invoice = await prisma.billingInvoice.create({
      data: {
        venueId: venue.id,
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
    console.log(`  ✅ Invoice created: ${invoice.id} — ${ref} — 5,000 VND OVERDUE`);
  }

  // Verify the billing status API would see this as overdue
  const overdueCount = await prisma.billingInvoice.count({
    where: { venueId: venue.id, status: "overdue" },
  });
  console.log(`\n🔒 Overdue invoices for ${venue.name}: ${overdueCount}`);
  console.log(overdueCount > 0
    ? "✅ Tabs WILL be blocked (hasOverdueBilling = true)"
    : "⚠️  No overdue invoices — tabs will NOT be blocked"
  );

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📋 SUMMARY");
  console.log("=".repeat(60));
  console.log(`Venue: ${venue.name} (${venue.id})`);
  console.log(`Session 1: ${session1Date.toDateString()} — ${session1.id}`);
  console.log(`Session 2: ${session2Date.toDateString()} — ${session2.id}`);
  console.log(`Overdue invoice: 5,000 VND`);
  console.log(`\nTo test: Log in as staff for ${venue.name} and check:`);
  console.log("  - Boss Dashboard → Today/History/Subs/Players should show blocked banner");
  console.log("  - Boss Dashboard → Billing should still be accessible");
  console.log("  - Staff Subscriptions → Subscribers tab should be blocked");
  console.log("  - Pay the invoice via PayOS to unlock the tabs");
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
