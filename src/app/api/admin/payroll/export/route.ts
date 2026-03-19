import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import {
  isMonday,
  parseWeekStart,
  getWeekRange,
  durationMinutes,
  roundHoursUp,
  formatWeekRangeShort,
  formatDateISO,
} from "@/lib/payroll";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const weekStartParam = request.nextUrl.searchParams.get("weekStart");
    if (!weekStartParam) return error("weekStart is required");
    if (!isMonday(weekStartParam)) return error("weekStart must be a Monday", 400);

    const weekStart = parseWeekStart(weekStartParam);
    const { start, end } = getWeekRange(weekStart);
    const weekLabel = formatWeekRangeShort(weekStart);

    const allStaff = await prisma.staffMember.findMany({
      include: { venues: { select: { name: true } } },
      orderBy: { name: "asc" },
    });

    const sessions = await prisma.session.findMany({
      where: {
        staffId: { not: null },
        openedAt: { gte: start, lte: end },
      },
      include: { venue: { select: { name: true } } },
    });

    const rows: string[] = [];
    rows.push("Week,Staff Name,Phone,Venue(s),Sessions,Total Hours,Status,Paid On,Note");

    let totalSessions = 0;
    let totalHoursAll = 0;

    for (const staff of allStaff) {
      const staffSessions = sessions.filter((s) => s.staffId === staff.id);
      if (staffSessions.length === 0) continue;

      const closed = staffSessions.filter((s) => s.closedAt !== null);
      let totalHours = 0;
      for (const s of closed) {
        const mins = durationMinutes(s.openedAt, s.closedAt!);
        if (mins >= 0) totalHours += roundHoursUp(mins);
      }

      const payment = await prisma.staffPayment.upsert({
        where: { staffId_weekStart: { staffId: staff.id, weekStart: start } },
        create: {
          staffId: staff.id,
          weekStart: start,
          totalHours: new Decimal(totalHours.toFixed(1)),
          status: "UNPAID",
        },
        update: {
          totalHours: new Decimal(totalHours.toFixed(1)),
        },
        include: { paidBy: { select: { name: true } } },
      });

      const venues = [...new Set(staffSessions.map((s) => s.venue.name))].join(" / ");
      const paidOn = payment.paidAt
        ? payment.paidAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        : "";

      totalSessions += closed.length;
      totalHoursAll += totalHours;

      const escapeCsv = (v: string) => v.includes(",") ? `"${v}"` : v;

      rows.push(
        [
          `${weekLabel} ${start.getUTCFullYear()}`,
          escapeCsv(staff.name),
          staff.phone,
          escapeCsv(venues),
          closed.length,
          totalHours.toFixed(1),
          payment.status === "PAID" ? "Paid" : "Unpaid",
          paidOn,
          escapeCsv(payment.note || ""),
        ].join(",")
      );
    }

    rows.push(`TOTAL,,,,${totalSessions},${totalHoursAll.toFixed(1)},,`);

    const csv = rows.join("\n");
    const filename = `payroll-week-${formatDateISO(start)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("admin")) return error(msg, 403);
    return error(msg, 500);
  }
}
