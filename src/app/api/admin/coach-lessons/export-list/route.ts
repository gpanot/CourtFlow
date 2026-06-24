/**
 * GET /api/admin/coach-lessons/export-list
 * Returns a CSV of lessons matching the same filters as /api/admin/coach-lessons?list=true.
 *
 * Query params: venueId, dateFrom, dateTo, status, paymentStatus, coachId, search
 */
import { NextRequest, NextResponse } from "next/server";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function durationHours(start: Date, end: Date): string {
  return ((end.getTime() - start.getTime()) / 3600000).toFixed(2);
}

function csvEscape(val: string | number | null | undefined): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);
  } catch {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const venueId = sp.get("venueId");
  const status = sp.get("status");
  const paymentStatus = sp.get("paymentStatus");
  const coachId = sp.get("coachId");
  const search = sp.get("search");
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");

  if (!venueId) {
    return NextResponse.json({ error: "venueId is required" }, { status: 400 });
  }

  const where: Record<string, unknown> = { venueId };

  if (coachId && coachId !== "all") where.coachId = coachId;
  if (status && status !== "all") where.status = status;

  if (paymentStatus && paymentStatus !== "all") {
    if (paymentStatus === "paid") {
      where.paymentStatus = { in: ["paid", "PAID"] };
    } else if (paymentStatus === "pending") {
      where.paymentStatus = { in: ["pending", "UNPAID"] };
    } else {
      where.paymentStatus = paymentStatus;
    }
  }

  if (dateFrom || dateTo) {
    const dateFilter: Record<string, unknown> = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      d.setHours(0, 0, 0, 0);
      dateFilter.gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      d.setHours(23, 59, 59, 999);
      dateFilter.lte = d;
    }
    where.date = dateFilter;
  }

  if (search && search.trim().length >= 2) {
    where.player = {
      OR: [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { phone: { contains: search.trim() } },
      ],
    };
  }

  const lessons = await prisma.coachLesson.findMany({
    where: where as never,
    include: {
      coach: { select: { name: true } },
      player: { select: { name: true, phone: true } },
      court: { select: { label: true } },
      package: { select: { name: true, lessonType: true } },
      venue: { select: { name: true } },
    },
    orderBy: { startTime: "desc" },
  });

  const header = [
    "Date", "Start", "End", "Duration (hrs)",
    "Player", "Phone", "Coach", "Package", "Type",
    "Court", "Venue", "Status", "Payment", "Price (VND)",
  ];

  const rows = lessons.map((l) => [
    fmtDate(l.date),
    fmtTime(l.startTime),
    fmtTime(l.endTime),
    durationHours(l.startTime, l.endTime),
    l.player.name,
    l.player.phone,
    l.coach.name,
    l.package.name,
    l.package.lessonType,
    l.court?.label ?? "",
    l.venue.name,
    l.status,
    l.paymentStatus,
    l.priceValue,
  ]);

  const totalRevenue = lessons
    .filter((l) => l.status !== "cancelled" && (l.paymentStatus === "paid" || l.paymentStatus === "PAID"))
    .reduce((s, l) => s + l.priceValue, 0);

  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
    "",
    `Total lessons,${lessons.length}`,
    `Paid revenue (VND),${totalRevenue}`,
  ];

  const filename = `lessons-${dateFrom ?? "all"}-to-${dateTo ?? "all"}-${fmtDate(new Date())}.csv`;

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
