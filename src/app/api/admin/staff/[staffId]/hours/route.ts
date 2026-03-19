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

    const weekStartParam = request.nextUrl.searchParams.get("weekStart");
    if (!weekStartParam) return error("weekStart is required");
    if (!isMonday(weekStartParam)) return error("weekStart must be a Monday", 400);

    const weekStart = parseWeekStart(weekStartParam);
    const { start, end } = getWeekRange(weekStart);

    const staff = await prisma.staffMember.findUnique({ where: { id: staffId } });
    if (!staff) return error("Staff member not found", 404);

    const sessions = await prisma.session.findMany({
      where: {
        staffId,
        openedAt: { gte: start, lte: end },
      },
      include: { venue: { select: { name: true } } },
      orderBy: { openedAt: "asc" },
    });

    const closedSessions = sessions.filter((s) => s.closedAt !== null);
    const openSessions = sessions.filter((s) => s.closedAt === null);

    let totalRoundedHours = 0;
    const sessionDetails = closedSessions.map((s) => {
      const mins = durationMinutes(s.openedAt, s.closedAt!);
      const rounded = mins < 0 ? 0 : roundHoursUp(mins);
      totalRoundedHours += rounded;
      return {
        sessionId: s.id,
        date: formatDateISO(s.openedAt),
        dayLabel: formatDayLabel(s.openedAt),
        venueName: s.venue.name,
        openedAt: formatTime(s.openedAt),
        closedAt: formatTime(s.closedAt!),
        rawMinutes: mins < 0 ? 0 : mins,
        rawDuration: formatRawDuration(mins < 0 ? 0 : mins),
        roundedHours: rounded,
        isOpen: false,
      };
    });

    const openSessionDetails = openSessions.map((s) => ({
      sessionId: s.id,
      date: formatDateISO(s.openedAt),
      dayLabel: formatDayLabel(s.openedAt),
      venueName: s.venue.name,
      openedAt: formatTime(s.openedAt),
    }));

    const payment = await prisma.staffPayment.upsert({
      where: { staffId_weekStart: { staffId, weekStart: start } },
      create: {
        staffId,
        weekStart: start,
        totalHours: new Decimal(totalRoundedHours.toFixed(1)),
        status: "UNPAID",
      },
      update: {
        totalHours: new Decimal(totalRoundedHours.toFixed(1)),
      },
      include: { paidBy: { select: { name: true } } },
    });

    return json({
      staff: { id: staff.id, name: staff.name, phone: staff.phone },
      weekStart: formatDateISO(start),
      weekEnd: formatDateISO(end),
      payment: {
        paymentId: payment.id,
        status: payment.status,
        totalHours: Number(payment.totalHours),
        amount: payment.amount ? Number(payment.amount) : null,
        paidAt: payment.paidAt,
        paidDate: payment.paidDate,
        paidByName: payment.paidBy?.name ?? null,
        note: payment.note,
      },
      sessions: sessionDetails,
      openSessions: openSessionDetails,
      totalRoundedHours,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("admin")) return error(msg, 403);
    return error(msg, 500);
  }
}
