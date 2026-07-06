/**
 * ONE-TIME endpoint — backfills venue slugs + invoice numbers on live DB.
 * DELETE THIS FILE after running.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";

export const dynamic = "force-dynamic";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

type InvoiceType = "BK" | "OP" | "CL";
const cache: Record<string, number> = {};

async function nextSeq(venueId: string, type: InvoiceType, year: number): Promise<number> {
  const key = `${venueId}:${type}:${year}`;
  if (cache[key] === undefined) {
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

async function buildInvoiceNumber(venueId: string, type: InvoiceType, paidAt: Date, venueSlug: string): Promise<string> {
  const year = paidAt.getFullYear();
  const seq = await nextSeq(venueId, type, year);
  const prefix = venueSlug.toUpperCase();
  return `${prefix}-${type}-${year}-${String(seq).padStart(4, "0")}`;
}

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization")?.replace("Bearer ", "");
    const querySecret = request.nextUrl.searchParams.get("secret");
    const cronAuthorized = cronSecret && (authHeader === cronSecret || querySecret === cronSecret);

    if (!cronAuthorized) {
      await requireAdminAccess(request.headers);
    }

    const log: string[] = [];

    // 1. Backfill venue slugs
    const venues = await prisma.venue.findMany({ select: { id: true, name: true, slug: true } });
    let slugsFixed = 0;
    for (const v of venues) {
      if (!v.slug) {
        const slug = slugify(v.name);
        await prisma.venue.update({ where: { id: v.id }, data: { slug } });
        log.push(`slug: ${v.name} → ${slug}`);
        slugsFixed++;
      }
    }
    log.push(`Slugs fixed: ${slugsFixed}`);

    // Re-fetch venues with slugs for the invoice step
    const venueMap = new Map<string, string>();
    const allVenues = await prisma.venue.findMany({ select: { id: true, slug: true } });
    for (const v of allVenues) {
      venueMap.set(v.id, (v.slug ?? v.id.slice(0, 4)).toUpperCase());
    }

    // 2. Single bookings
    const singleBookings = await prisma.booking.findMany({
      where: { paymentStatus: { in: ["paid", "PAID"] }, bookingGroupId: null, invoiceNumber: null },
      orderBy: { startTime: "asc" },
      select: { id: true, venueId: true, startTime: true },
    });
    for (const b of singleBookings) {
      const slug = venueMap.get(b.venueId) ?? b.venueId.slice(0, 4).toUpperCase();
      const inv = await buildInvoiceNumber(b.venueId, "BK", b.startTime, slug);
      await prisma.booking.update({ where: { id: b.id }, data: { invoiceNumber: inv, invoicedAt: b.startTime } });
    }
    log.push(`Single bookings invoiced: ${singleBookings.length}`);

    // 3. Group bookings
    const groups = await prisma.bookingGroup.findMany({
      where: { paymentStatus: { in: ["paid", "PAID"] }, invoiceNumber: null },
      orderBy: { startTime: "asc" },
      select: { id: true, venueId: true, startTime: true },
    });
    for (const g of groups) {
      const slug = venueMap.get(g.venueId) ?? g.venueId.slice(0, 4).toUpperCase();
      const inv = await buildInvoiceNumber(g.venueId, "BK", g.startTime, slug);
      await prisma.bookingGroup.update({ where: { id: g.id }, data: { invoiceNumber: inv, invoicedAt: g.startTime } });
    }
    log.push(`Group bookings invoiced: ${groups.length}`);

    // 4. Open play
    const openPlay = await prisma.openPlayRegistration.findMany({
      where: { paymentStatus: { in: ["paid", "PAID"] }, invoiceNumber: null },
      orderBy: { startTime: "asc" },
      select: { id: true, venueId: true, startTime: true },
    });
    for (const r of openPlay) {
      const slug = venueMap.get(r.venueId) ?? r.venueId.slice(0, 4).toUpperCase();
      const inv = await buildInvoiceNumber(r.venueId, "OP", r.startTime, slug);
      await prisma.openPlayRegistration.update({ where: { id: r.id }, data: { invoiceNumber: inv, invoicedAt: r.startTime } });
    }
    log.push(`Open play invoiced: ${openPlay.length}`);

    // 5. Coach lessons
    const lessons = await prisma.coachLesson.findMany({
      where: { paymentStatus: { in: ["paid", "PAID"] }, invoiceNumber: null },
      orderBy: { startTime: "asc" },
      select: { id: true, venueId: true, paidAt: true, startTime: true },
    });
    for (const l of lessons) {
      const slug = venueMap.get(l.venueId) ?? l.venueId.slice(0, 4).toUpperCase();
      const inv = await buildInvoiceNumber(l.venueId, "CL", l.paidAt ?? l.startTime, slug);
      await prisma.coachLesson.update({ where: { id: l.id }, data: { invoiceNumber: inv, invoicedAt: l.paidAt ?? l.startTime } });
    }
    log.push(`Coach lessons invoiced: ${lessons.length}`);

    await flushCounters();

    // Final state
    const counters = await prisma.$queryRaw<{ venue_id: string; type: string; year: number; last_seq: number }[]>`
      SELECT s.venue_id, s.type, s.year, s.last_seq
      FROM invoice_sequences s ORDER BY s.year DESC, s.type
    `;
    log.push(`Counters: ${JSON.stringify(counters)}`);

    return json({ ok: true, log });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Unauthorized") || msg.includes("Missing")) return error(msg, 401);
    return error(msg, 500);
  }
}
