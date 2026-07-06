/**
 * One-off script: backfill invoice_number + invoiced_at on all existing paid records.
 * Run: npx ts-node --project tsconfig.json -e "$(cat scripts/seed-invoice-numbers.ts)"
 * Or:  npx tsx scripts/seed-invoice-numbers.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type InvoiceType = "BK" | "OP" | "CL";

// In-process counter cache so we don't hit the DB for each row
const cache: Record<string, number> = {};

async function nextSeq(venueId: string, type: InvoiceType, year: number): Promise<number> {
  const key = `${venueId}:${type}:${year}`;
  if (cache[key] === undefined) {
    // Load current value from DB (or 0 if row doesn't exist yet)
    const row = await prisma.$queryRaw<{ last_seq: number }[]>`
      SELECT last_seq FROM invoice_sequences
      WHERE venue_id = ${venueId} AND type = ${type} AND year = ${year}
    `;
    cache[key] = row[0]?.last_seq ?? 0;
  }
  cache[key]++;
  return cache[key];
}

async function flushCounters(): Promise<void> {
  for (const key of Object.keys(cache)) {
    const [venueId, type, yearStr] = key.split(":");
    const year = parseInt(yearStr, 10);
    const lastSeq = cache[key];
    await prisma.$executeRaw`
      INSERT INTO invoice_sequences (venue_id, type, year, last_seq)
      VALUES (${venueId}, ${type}, ${year}, ${lastSeq})
      ON CONFLICT (venue_id, type, year)
      DO UPDATE SET last_seq = ${lastSeq}
    `;
  }
}

async function buildInvoiceNumber(venueId: string, type: InvoiceType, paidAt: Date): Promise<string> {
  const year = paidAt.getFullYear();
  const seq = await nextSeq(venueId, type, year);
  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { slug: true } });
  const prefix = (venue?.slug ?? venueId.slice(0, 4)).toUpperCase();
  return `${prefix}-${type}-${year}-${String(seq).padStart(4, "0")}`;
}

async function main() {
  console.log("=== Invoice Number Backfill ===\n");

  // 1. Single bookings (paid, no group)
  const singleBookings = await prisma.booking.findMany({
    where: {
      paymentStatus: { in: ["paid", "PAID"] },
      bookingGroupId: null,
      invoiceNumber: null,
    },
    orderBy: { startTime: "asc" },
    select: { id: true, venueId: true, startTime: true },
  });

  console.log(`Single bookings to backfill: ${singleBookings.length}`);
  for (const b of singleBookings) {
    const inv = await buildInvoiceNumber(b.venueId, "BK", b.startTime);
    await prisma.booking.update({
      where: { id: b.id },
      data: { invoiceNumber: inv, invoicedAt: b.startTime },
    });
    console.log(`  BK ${b.id.slice(-8)} → ${inv}`);
  }

  // 2. Group bookings (paid)
  const groups = await prisma.bookingGroup.findMany({
    where: {
      paymentStatus: { in: ["paid", "PAID"] },
      invoiceNumber: null,
    },
    orderBy: { startTime: "asc" },
    select: { id: true, venueId: true, startTime: true },
  });

  console.log(`\nGroup bookings to backfill: ${groups.length}`);
  for (const g of groups) {
    const inv = await buildInvoiceNumber(g.venueId, "BK", g.startTime);
    await prisma.bookingGroup.update({
      where: { id: g.id },
      data: { invoiceNumber: inv, invoicedAt: g.startTime },
    });
    console.log(`  GRP ${g.id.slice(-8)} → ${inv}`);
  }

  // 3. Open play registrations (paid)
  const openPlay = await prisma.openPlayRegistration.findMany({
    where: {
      paymentStatus: { in: ["paid", "PAID"] },
      invoiceNumber: null,
    },
    orderBy: { startTime: "asc" },
    select: { id: true, venueId: true, startTime: true },
  });

  console.log(`\nOpen play registrations to backfill: ${openPlay.length}`);
  for (const r of openPlay) {
    const inv = await buildInvoiceNumber(r.venueId, "OP", r.startTime);
    await prisma.openPlayRegistration.update({
      where: { id: r.id },
      data: { invoiceNumber: inv, invoicedAt: r.startTime },
    });
    console.log(`  OP  ${r.id.slice(-8)} → ${inv}`);
  }

  // 4. Coach lessons (paid)
  const lessons = await prisma.coachLesson.findMany({
    where: {
      paymentStatus: { in: ["paid", "PAID"] },
      invoiceNumber: null,
    },
    orderBy: { startTime: "asc" },
    select: { id: true, venueId: true, paidAt: true, startTime: true },
  });

  console.log(`\nCoach lessons to backfill: ${lessons.length}`);
  for (const l of lessons) {
    const inv = await buildInvoiceNumber(l.venueId, "CL", l.paidAt ?? l.startTime);
    await prisma.coachLesson.update({
      where: { id: l.id },
      data: { invoiceNumber: inv, invoicedAt: l.paidAt ?? l.startTime },
    });
    console.log(`  CL  ${l.id.slice(-8)} → ${inv}`);
  }

  // Flush all in-memory counters to DB
  await flushCounters();

  console.log("\n✅ Done. Counter table state:");
  const counters = await prisma.$queryRaw<{ venue_id: string; type: string; year: number; last_seq: number }[]>`
    SELECT is2.venue_id, is2.type, is2.year, is2.last_seq
    FROM invoice_sequences is2
    JOIN venues v ON v.id = is2.venue_id
    ORDER BY is2.year DESC, is2.type, v.slug
  `;
  for (const c of counters) {
    console.log(`  ${c.venue_id.slice(-8)} | ${c.type} | ${c.year} | last_seq=${c.last_seq}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
