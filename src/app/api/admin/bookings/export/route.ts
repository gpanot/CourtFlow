/**
 * GET /api/admin/bookings/export
 * Returns a CSV of bookings matching the same filters as /api/admin/bookings.
 *
 * Query params: venueId, dateFrom, dateTo, status, paymentStatus, search
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveBookingRef } from "@/lib/booking-reference";
import {
  getCancellationReasonLabel,
  getNetBookingPrice,
} from "@/lib/booking-cancellation";

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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  vietqr: "QR",
  bank_transfer: "Transfer",
  other: "Other",
};

function fmtPaymentMethod(method: string | null): string {
  if (!method) return "";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminAccess(request.headers);
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
    const q = search.trim();
    where.AND = [
      {
        OR: [
          { player: { name: { contains: q, mode: "insensitive" } } },
          { player: { phone: { contains: q } } },
          { paymentRef: { contains: q, mode: "insensitive" } },
          { invoiceNumber: { contains: q, mode: "insensitive" } },
          { bookingGroup: { paymentRef: { contains: q, mode: "insensitive" } } },
          { bookingGroup: { invoiceNumber: { contains: q, mode: "insensitive" } } },
        ],
      },
    ];
  }

  const bookings = await prisma.booking.findMany({
    where: where as never,
    include: {
      court: { select: { label: true } },
      player: { select: { name: true, phone: true } },
      venue: { select: { name: true } },
      bookingGroup: { select: { paymentRef: true, invoiceNumber: true, cancellationReason: true } },
    },
    orderBy: { startTime: "desc" },
  });

  const header = [
    "Date", "Time", "Player", "Phone", "Court", "Venue", "Status", "Payment",
    "Payment Method", "Cancellation Reason", "Booking ref", "Invoice ref", "Price (VND)",
  ];
  const rows = bookings.map((b) => {
    const cancellationReason = b.cancellationReason ?? b.bookingGroup?.cancellationReason ?? null;
    const netPrice = getNetBookingPrice(b.priceValue, {
      status: b.status,
      paymentStatus: b.paymentStatus,
      cancellationReason,
    });
    return [
      fmtDate(b.date),
      `${fmtTime(b.startTime)} – ${fmtTime(b.endTime)}`,
      b.player.name,
      b.player.phone,
      b.court.label,
      b.venue.name,
      b.status,
      b.paymentStatus ?? "pending",
      fmtPaymentMethod(b.paymentMethod),
      getCancellationReasonLabel(cancellationReason) ?? "",
      resolveBookingRef(b) ?? "",
      b.invoiceNumber ?? b.bookingGroup?.invoiceNumber ?? "",
      netPrice,
    ];
  });

  const totalRevenue = bookings.reduce((sum, b) => {
    const cancellationReason = b.cancellationReason ?? b.bookingGroup?.cancellationReason ?? null;
    return sum + getNetBookingPrice(b.priceValue, {
      status: b.status,
      paymentStatus: b.paymentStatus,
      cancellationReason,
    });
  }, 0);

  const lines = [
    header.map(csvEscape).join(","),
    ...rows.map((r) => r.map(csvEscape).join(",")),
    "",
    `Total bookings,${bookings.length}`,
    `Total revenue (VND),${totalRevenue}`,
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
