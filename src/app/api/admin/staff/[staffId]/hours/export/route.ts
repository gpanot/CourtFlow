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
  formatDateISO,
  formatWeekRangeShort,
  formatDayLabel,
  formatTime,
  formatRawDuration,
} from "@/lib/payroll";
import { Decimal } from "@prisma/client/runtime/library";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ staffId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { staffId } = await params;

    const fromParam = request.nextUrl.searchParams.get("from");
    const toParam = request.nextUrl.searchParams.get("to");
    if (!fromParam || !toParam) return error("from and to are required");
    if (!isMonday(fromParam)) return error("from must be a Monday", 400);
    if (!isMonday(toParam)) return error("to must be a Monday", 400);

    const fromDate = parseWeekStart(fromParam);
    const toDate = parseWeekStart(toParam);
    if (fromDate > toDate) return error("from must be before to", 400);

    const staff = await prisma.staffMember.findUnique({ where: { id: staffId } });
    if (!staff) return error("Staff member not found", 404);

    const { end: rangeEnd } = getWeekRange(toDate);
    const allSessions = await prisma.session.findMany({
      where: {
        staffId,
        openedAt: { gte: fromDate, lte: rangeEnd },
      },
      include: { venue: { select: { name: true } } },
      orderBy: { openedAt: "asc" },
    });

    const escapeCsv = (v: string) => v.includes(",") ? `"${v}"` : v;

    // Section 1: Weekly summary
    const rows: string[] = ["WEEKLY SUMMARY"];
    rows.push("Staff,Phone,Week,Venue(s),Sessions,Hours,Status,Paid On");

    let totalSessions = 0;
    let totalHoursAll = 0;

    const current = new Date(fromDate);
    while (current <= toDate) {
      const ws = new Date(current);
      const { start, end } = getWeekRange(ws);
      const weekSessions = allSessions.filter(
        (s) => s.openedAt >= start && s.openedAt <= end
      );

      if (weekSessions.length > 0) {
        const closed = weekSessions.filter((s) => s.closedAt !== null);
        let totalHours = 0;
        for (const s of closed) {
          const mins = durationMinutes(s.openedAt, s.closedAt!);
          if (mins >= 0) totalHours += roundHoursUp(mins);
        }

        const payment = await prisma.staffPayment.upsert({
          where: { staffId_weekStart: { staffId, weekStart: start } },
          create: { staffId, weekStart: start, totalHours: new Decimal(totalHours.toFixed(1)), status: "UNPAID" },
          update: { totalHours: new Decimal(totalHours.toFixed(1)) },
          include: { paidBy: { select: { name: true } } },
        });

        const venues = [...new Set(weekSessions.map((s) => s.venue.name))].join(" / ");
        const paidOn = payment.paidAt
          ? payment.paidAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "";

        totalSessions += closed.length;
        totalHoursAll += totalHours;

        rows.push(
          [
            escapeCsv(staff.name),
            staff.phone,
            `${formatWeekRangeShort(start)} ${start.getUTCFullYear()}`,
            escapeCsv(venues),
            closed.length,
            totalHours.toFixed(1),
            payment.status === "PAID" ? "Paid" : "Unpaid",
            paidOn,
          ].join(",")
        );
      }

      current.setUTCDate(current.getUTCDate() + 7);
    }

    rows.push(`TOTAL,,,,${totalSessions},${totalHoursAll.toFixed(1)},,`);
    rows.push("");

    // Section 2: Session detail
    rows.push("SESSION DETAIL");
    rows.push("Staff,Date,Venue,Session Start,Session End,Raw Duration,Rounded Hours");

    const closedAll = allSessions.filter((s) => s.closedAt !== null);
    for (const s of closedAll) {
      const mins = durationMinutes(s.openedAt, s.closedAt!);
      const rounded = mins < 0 ? 0 : roundHoursUp(mins);
      rows.push(
        [
          escapeCsv(staff.name),
          formatDayLabel(s.openedAt),
          escapeCsv(s.venue.name),
          formatTime(s.openedAt),
          formatTime(s.closedAt!),
          formatRawDuration(mins < 0 ? 0 : mins),
          rounded.toFixed(1),
        ].join(",")
      );
    }

    const csv = rows.join("\n");
    const kebabName = staff.name.toLowerCase().replace(/\s+/g, "-");
    const filename = `payroll-${kebabName}-${fromParam}-to-${toParam}.csv`;

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
