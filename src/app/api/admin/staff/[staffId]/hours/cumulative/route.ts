import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import {
  isMonday,
  parseWeekStart,
  getWeekRange,
  durationMinutes,
  roundHoursUp,
  formatDateISO,
  formatWeekRangeShort,
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

    const weekCount = Math.round((toDate.getTime() - fromDate.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
    if (weekCount > 26) return error("Maximum range is 26 weeks", 400);

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

    const weeks = [];
    let totalHoursAll = 0;
    let paidHoursAll = 0;
    let unpaidHoursAll = 0;
    let paidWeeksCount = 0;
    let unpaidWeeksCount = 0;

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
          create: {
            staffId,
            weekStart: start,
            totalHours: new Decimal(totalHours.toFixed(1)),
            status: "UNPAID",
          },
          update: {
            totalHours: new Decimal(totalHours.toFixed(1)),
          },
          include: { paidBy: { select: { name: true } } },
        });

        totalHoursAll += totalHours;
        if (payment.status === "PAID") {
          paidHoursAll += totalHours;
          paidWeeksCount++;
        } else {
          unpaidHoursAll += totalHours;
          unpaidWeeksCount++;
        }

        weeks.push({
          weekStart: formatDateISO(start),
          weekEnd: formatDateISO(end),
          weekLabel: formatWeekRangeShort(start),
          paymentId: payment.id,
          totalHours,
          sessionCount: closed.length,
          status: payment.status,
          paidAt: payment.paidAt,
          paidByName: payment.paidBy?.name ?? null,
        });
      }

      current.setUTCDate(current.getUTCDate() + 7);
    }

    return json({
      staff: { id: staff.id, name: staff.name, phone: staff.phone },
      from: fromParam,
      to: toParam,
      weeks,
      totals: {
        totalHours: Math.round(totalHoursAll * 10) / 10,
        unpaidHours: Math.round(unpaidHoursAll * 10) / 10,
        paidHours: Math.round(paidHoursAll * 10) / 10,
        unpaidWeeks: unpaidWeeksCount,
        paidWeeks: paidWeeksCount,
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("admin")) return error(msg, 403);
    return error(msg, 500);
  }
}
