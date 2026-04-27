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

    const allStaff = await prisma.staffMember.findMany({
      orderBy: { name: "asc" },
    });

    const sessions = await prisma.session.findMany({
      where: {
        staffId: { not: null },
        openedAt: { gte: start, lte: end },
      },
      include: {
        venue: { select: { name: true } },
      },
    });

    const staffData = [];

    for (const staff of allStaff) {
      const staffSessions = sessions.filter((s) => s.staffId === staff.id);
      if (staffSessions.length === 0) continue;

      const closedSessions = staffSessions.filter((s) => s.closedAt !== null);
      const openSessions = staffSessions.filter((s) => s.closedAt === null);

      let totalHours = 0;
      for (const s of closedSessions) {
        const mins = durationMinutes(s.openedAt, s.closedAt!);
        if (mins < 0) continue;
        totalHours += roundHoursUp(mins);
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
        include: {
          paidBy: { select: { name: true } },
        },
      });

      const venues = [...new Set(staffSessions.map((s) => s.venue.name))];

      staffData.push({
        paymentId: payment.id,
        staffId: staff.id,
        name: staff.name,
        phone: staff.phone,
        venues,
        closedSessionCount: closedSessions.length,
        openSessionCount: openSessions.length,
        totalHours: Number(payment.totalHours),
        amount: payment.amount ? Number(payment.amount) : null,
        paymentMethod: payment.paymentMethod,
        status: payment.status,
        paidAt: payment.paidAt,
        paidDate: payment.paidDate,
        paidByName: payment.paidBy?.name ?? null,
        note: payment.note,
      });
    }

    staffData.sort((a, b) => {
      if (a.status === "UNPAID" && b.status === "PAID") return -1;
      if (a.status === "PAID" && b.status === "UNPAID") return 1;
      return a.name.localeCompare(b.name);
    });

    const summary = {
      totalStaff: staffData.length,
      totalHours: staffData.reduce((sum, s) => sum + s.totalHours, 0),
      unpaidCount: staffData.filter((s) => s.status === "UNPAID").length,
      paidCount: staffData.filter((s) => s.status === "PAID").length,
    };

    return json({
      weekStart: formatDateISO(start),
      weekEnd: formatDateISO(end),
      summary,
      staff: staffData,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("admin")) return error(msg, 403);
    return error(msg, 500);
  }
}
