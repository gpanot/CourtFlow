/**
 * GET /api/admin/bookings/export
 * Returns a CSV of bookings matching the same filters as /api/admin/bookings.
 *
 * Query params: venueId, dateFrom, dateTo, status, paymentStatus, search
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
  const search = sp.get("search");
  const dateFrom = sp.get("dateFrom");
  const dateTo = sp.get("dateTo");

  if (!venueId) {
    return NextResponse.json({ error: "venueId is required" }, { status: 400 });
  }

  const where: Record<string, unknown> = { venueId };

  if (status && status !== "all") where.status = status;

  if (paymentStatus && paymentStatus !== "all") {
    if (paymentStatus === "paid") {
      where.paymentStatus = { in: ["paid", "PAID"] };
    } else if (paymentStatus === "pending") {
      where.OR = [
        { paymentStatus: "pending" },
        { paymentStatus: { equals: null } },
      ];
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

  const bookings = await prisma.booking.findMany({
    where: where as never,
    include: {
      court: { select: { label: true } },
      player: { select: { name: true, phone: true } },
      venue: { select: { name: true } },
    },
    orderBy: { startTime: "desc" },
  });

  const header = ["Date", "Time", "Player", "Phone", "Court", "Venue", "Status", "Payment", "Price (VND)"];
  const rows = bookings.map((b) => [
    fmtDate(b.date),
    `${fmtTime(b.startTime)} – ${fmtTime(b.endTime)}`,
    b.player.name,
    b.player.phone,
    b.court.label,
    b.venue.name,
    b.status,
    b.paymentStatus ?? "pending",
    b.priceValue,
  ]);

  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
    "",
    `Total bookings,${bookings.length}`,
    `Total revenue (VND),${bookings.filter((b) => b.status !== "cancelled").reduce((s, b) => s + b.priceValue, 0)}`,
  ];

  const filename = `bookings-${dateFrom ?? "all"}-to-${dateTo ?? "all"}-${fmtDate(new Date())}.csv`;

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
