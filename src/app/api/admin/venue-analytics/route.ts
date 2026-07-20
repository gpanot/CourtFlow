import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { getBookingConfig } from "@/lib/booking";

export const dynamic = "force-dynamic";

function isCashBooking(b: { paymentStatus: string | null; companyOpenBillId?: string | null }) {
  return !b.companyOpenBillId && b.paymentStatus !== "open_bill";
}

export async function GET(request: NextRequest) {
  try {
    const auth = await await requireAdminAccess(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");
    await assertVenueAccess(auth, venueId);

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    if (!from || !to) return error("from and to dates are required");

    const dateFrom = new Date(from + "T00:00:00Z");
    const dateTo = new Date(to + "T23:59:59Z");

    const [
      venue,
      courts,
      bookings,
      memberships,
      membershipTiers,
      staffPayments,
      staffAssignments,
      totalPlayers,
      coachLessons,
      players,
      openPlayRegistrations,
      courtPayPayments,
      courtBlocks,
    ] = await Promise.all([
      prisma.venue.findUnique({
        where: { id: venueId },
        select: { settings: true },
      }),
      prisma.court.findMany({
        where: { venueId, isBookable: true },
        select: { id: true, label: true },
      }),
      prisma.booking.findMany({
        where: {
          venueId,
          date: { gte: dateFrom, lte: dateTo },
        },
        select: {
          id: true,
          courtId: true,
          playerId: true,
          date: true,
          startTime: true,
          endTime: true,
          status: true,
          priceValue: true,
          paymentStatus: true,
          companyOpenBillId: true,
        },
      }),
      prisma.membership.findMany({
        where: { venueId },
        select: {
          id: true,
          status: true,
          tierId: true,
          activatedAt: true,
          sessionsUsed: true,
          createdAt: true,
          tier: { select: { name: true, sessionsIncluded: true, priceValue: true } },
        },
      }),
      prisma.membershipTier.findMany({
        where: { venueId, isActive: true },
        select: { id: true, name: true, priceValue: true, sessionsIncluded: true },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.staffPayment.findMany({
        where: {
          weekStart: { gte: dateFrom, lte: dateTo },
          staff: {
            venueAssignments: { some: { venueId } },
          },
        },
        select: {
          id: true,
          staffId: true,
          weekStart: true,
          totalHours: true,
          amount: true,
          status: true,
          staff: { select: { name: true } },
        },
      }),
      prisma.staffVenueAssignment.findMany({
        where: { venueId },
        select: {
          staff: { select: { id: true, name: true, isCoach: true } },
        },
      }),
      prisma.player.count({
        where: { registrationVenueId: venueId },
      }),
      prisma.coachLesson.findMany({
        where: {
          venueId,
          date: { gte: dateFrom, lte: dateTo },
        },
        select: {
          id: true,
          coachId: true,
          courtId: true,
          date: true,
          startTime: true,
          endTime: true,
          status: true,
          priceValue: true,
          paymentStatus: true,
          coach: { select: { name: true } },
          package: { select: { name: true, lessonType: true } },
        },
      }),
      prisma.player.findMany({
        where: { registrationVenueId: venueId },
        select: {
          id: true,
          name: true,
          skillLevel: true,
          gender: true,
          createdAt: true,
          rankingScore: true,
          rankingCount: true,
          isWalkIn: true,
          _count: {
            select: {
              bookings: { where: { venueId, date: { gte: dateFrom, lte: dateTo } } },
              coachLessons: { where: { venueId, date: { gte: dateFrom, lte: dateTo } } },
            },
          },
        },
      }),
      // Open Play registrations in period
      prisma.openPlayRegistration.findMany({
        where: {
          venueId,
          date: { gte: dateFrom, lte: dateTo },
          status: { not: "cancelled" },
        },
        select: {
          id: true,
          date: true,
          priceValue: true,
          paymentStatus: true,
          status: true,
        },
      }),
      // CourtPay confirmed payments in period (session_fee payments)
      prisma.pendingPayment.findMany({
        where: {
          venueId,
          status: "confirmed",
          confirmedAt: { gte: dateFrom, lte: dateTo },
        },
        select: {
          id: true,
          amount: true,
          confirmedAt: true,
          type: true,
          partyCount: true,
        },
      }),
      // Court blocks (maintenance, private events, program pass blocks, etc.)
      prisma.courtBlock.findMany({
        where: {
          venueId,
          date: { gte: dateFrom, lte: dateTo },
        },
        select: {
          id: true,
          type: true,
          courtIds: true,
          startTime: true,
          endTime: true,
        },
      }),
    ]);

    // --- MONTH PROJECTION DATA ---
    const now = new Date();
    const currentMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    const currentMonthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59));
    const last90Start = new Date(now);
    last90Start.setDate(last90Start.getDate() - 90);
    last90Start.setUTCHours(0, 0, 0, 0);

    // Previous month range for MoM comparison
    const prevMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
    const prevMonthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0, 23, 59, 59));

    const [monthBookings, last90Bookings, openPlaySessions, prevMonthBookings, prevMonthLessons] = await Promise.all([
      prisma.booking.findMany({
        where: {
          venueId,
          date: { gte: currentMonthStart, lte: currentMonthEnd },
          status: { in: ["confirmed", "completed"] },
        },
        select: { date: true, priceValue: true, startTime: true, endTime: true, paymentStatus: true, companyOpenBillId: true },
      }),
      prisma.booking.findMany({
        where: {
          venueId,
          date: { gte: last90Start, lt: currentMonthStart },
          status: { in: ["confirmed", "completed"] },
        },
        select: { date: true, priceValue: true, startTime: true, endTime: true, paymentStatus: true, companyOpenBillId: true },
      }),
      prisma.session.findMany({
        where: {
          venueId,
          openedAt: { gte: dateFrom, lte: dateTo },
        },
        select: { id: true, openedAt: true, closedAt: true },
      }),
      prisma.booking.findMany({
        where: {
          venueId,
          date: { gte: prevMonthStart, lte: prevMonthEnd },
        },
        select: { status: true, priceValue: true, startTime: true, endTime: true, paymentStatus: true, companyOpenBillId: true },
      }),
      prisma.coachLesson.findMany({
        where: {
          venueId,
          date: { gte: prevMonthStart, lte: prevMonthEnd },
          status: { in: ["confirmed", "completed"] },
        },
        select: { startTime: true, endTime: true, courtId: true },
      }),
    ]);

    // --- OPEN BILL + PROGRAM PASS METRICS (parallel, not blocking) ---
    const [openBillPeriodBills, openBillCollectedBills, programPassAgg, programPassUnpaidCount, programPassOverdueCount] = await Promise.all([
      // Accrued: all non-void bills with a periodStart in the date range
      prisma.companyOpenBill.findMany({
        where: {
          companyAccount: { venueId },
          status: { in: ["open", "issued", "overdue"] },
          periodStart: { gte: dateFrom, lte: dateTo },
        },
        select: { totalAmount: true, subtotal: true, discountAmount: true, vatAmount: true },
      }),
      // Collected: bills paid within the date range
      prisma.companyOpenBill.findMany({
        where: {
          companyAccount: { venueId },
          status: "paid",
          paidAt: { gte: dateFrom, lte: dateTo },
        },
        select: { totalAmount: true, subtotal: true, discountAmount: true, vatAmount: true },
      }),
      // Program pass payments collected in period
      prisma.programPassPayment.aggregate({
        where: {
          programPass: { venueId },
          status: "PAID",
          paidAt: { gte: dateFrom, lte: dateTo },
        },
        _sum: { amountValue: true },
      }),
      // Unpaid (not yet past due)
      prisma.programPassPayment.count({
        where: {
          programPass: { venueId },
          status: "UNPAID",
          periodEnd: { gte: now },
        },
      }),
      // Overdue (past due)
      prisma.programPassPayment.count({
        where: {
          programPass: { venueId },
          status: "UNPAID",
          periodEnd: { lt: now },
        },
      }),
    ]);

    const openBillAccrued = openBillPeriodBills.reduce((s, b) => s + b.totalAmount, 0);
    const openBillCollected = openBillCollectedBills.reduce((s, b) => s + b.totalAmount, 0);
    // Rack-rate total of open-bill bookings in period (for reconciliation display)
    const openBillRackSubtotal = openBillPeriodBills.reduce((s, b) => s + b.subtotal, 0);
    const openBillDiscountTotal = openBillPeriodBills.reduce((s, b) => s + b.discountAmount, 0);
    const openBillVatTotal = openBillPeriodBills.reduce((s, b) => s + b.vatAmount, 0);

    // Revenue and hours per day for current month — exclude open_bill bookings from cash revenue
    const daysInMonth = currentMonthEnd.getUTCDate();
    const todayDate = now.getUTCDate();
    const monthLabel = currentMonthStart.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

    const monthRevenueByDay: Record<number, number> = {};
    const monthHoursByDay: Record<number, number> = {};
    for (const b of monthBookings) {
      if (!isCashBooking(b)) continue;
      const day = new Date(b.date).getUTCDate();
      monthRevenueByDay[day] = (monthRevenueByDay[day] || 0) + b.priceValue;
      monthHoursByDay[day] = (monthHoursByDay[day] || 0) +
        (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000;
    }

    // 90-day daily averages for projection — exclude open_bill bookings
    const last90Days = Math.max(1, Math.ceil((currentMonthStart.getTime() - last90Start.getTime()) / 86400000));
    const totalRevenue90 = last90Bookings
      .filter(isCashBooking)
      .reduce((s, b) => s + b.priceValue, 0);
    let totalHours90 = 0;
    for (const b of last90Bookings) {
      totalHours90 += (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000;
    }
    const avgDailyRevenue = totalRevenue90 / last90Days;
    const avgDailyHours = totalHours90 / last90Days;

    // Build the chart data: one entry per day of the month
    const monthChartDays: { day: number; date: string; revenue: number; projected: number; hours: number; projectedHours: number; isPast: boolean }[] = [];
    let actualMonthRevenue = 0;
    let actualMonthHours = 0;
    let projectedMonthRevenue = 0;
    let projectedMonthHours = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentMonthStart.getUTCFullYear()}-${String(currentMonthStart.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const isPast = d <= todayDate;
      const actualRev = monthRevenueByDay[d] || 0;
      const actualHrs = monthHoursByDay[d] || 0;

      if (isPast) {
        actualMonthRevenue += actualRev;
        actualMonthHours += actualHrs;
        projectedMonthRevenue += actualRev;
        projectedMonthHours += actualHrs;
      } else {
        projectedMonthRevenue += avgDailyRevenue;
        projectedMonthHours += avgDailyHours;
      }

      monthChartDays.push({
        day: d,
        date: dateStr,
        revenue: isPast ? actualRev : 0,
        projected: isPast ? 0 : Math.round(avgDailyRevenue),
        hours: isPast ? Math.round(actualHrs * 10) / 10 : 0,
        projectedHours: isPast ? 0 : Math.round(avgDailyHours * 10) / 10,
        isPast,
      });
    }

    // --- COURT BOOKING ANALYTICS ---
    const confirmedBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const cancelledBookings = bookings.filter((b) => b.status === "cancelled");
    // Cash-paying confirmed bookings only — open-bill bookings tracked via company_open_bills
    const cashConfirmedBookings = confirmedBookings.filter(isCashBooking);

    const totalDays = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000));
    const bookableCourtCount = courts.length;

    // Use real venue opening hours from bookingConfig
    const bookingConfig = getBookingConfig((venue?.settings as Record<string, unknown>) ?? {});
    const hoursPerDayPerCourt = bookingConfig.bookingEndHour - bookingConfig.bookingStartHour;
    const totalAvailableHours = bookableCourtCount * hoursPerDayPerCourt * totalDays;

    let totalBookedHours = 0;
    for (const b of confirmedBookings) {
      const dur = (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000;
      totalBookedHours += dur;
    }

    const utilizationPct = totalAvailableHours > 0 ? Math.round((totalBookedHours / totalAvailableHours) * 100) : 0;

    const bookingRevenue = cashConfirmedBookings.reduce((s, b) => s + b.priceValue, 0);

    // Bookings per day
    const bookingsByDate: Record<string, number> = {};
    const hoursByDate: Record<string, number> = {};
    for (const b of confirmedBookings) {
      const d = new Date(b.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      bookingsByDate[key] = (bookingsByDate[key] || 0) + 1;
      hoursByDate[key] = (hoursByDate[key] || 0) +
        (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000;
    }

    const dailyAvailableHours = bookableCourtCount * hoursPerDayPerCourt;
    const dailyUtilization: { date: string; utilizationPct: number; hours: number; availableHours: number }[] = [];
    const rangeCursor = new Date(dateFrom);
    while (rangeCursor <= dateTo) {
      const key = `${rangeCursor.getUTCFullYear()}-${String(rangeCursor.getUTCMonth() + 1).padStart(2, "0")}-${String(rangeCursor.getUTCDate()).padStart(2, "0")}`;
      const hours = Math.round((hoursByDate[key] || 0) * 10) / 10;
      const utilizationPct = dailyAvailableHours > 0 ? Math.round((hours / dailyAvailableHours) * 100) : 0;
      dailyUtilization.push({ date: key, utilizationPct, hours, availableHours: dailyAvailableHours });
      rangeCursor.setUTCDate(rangeCursor.getUTCDate() + 1);
    }

    // Per-court usage
    const perCourt: Record<string, { label: string; bookings: number; hours: number; availableHours: number; utilizationPct: number }> = {};
    const availableHoursPerCourt = hoursPerDayPerCourt * totalDays;
    for (const c of courts) perCourt[c.id] = { label: c.label, bookings: 0, hours: 0, availableHours: availableHoursPerCourt, utilizationPct: 0 };
    for (const b of confirmedBookings) {
      if (perCourt[b.courtId]) {
        perCourt[b.courtId].bookings++;
        perCourt[b.courtId].hours += (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000;
      }
    }
    for (const c of Object.values(perCourt)) {
      c.hours = Math.round(c.hours * 10) / 10;
      c.utilizationPct = availableHoursPerCourt > 0 ? Math.round((c.hours / availableHoursPerCourt) * 100) : 0;
    }

    // Peak hours heatmap (hour -> day-of-week -> count)
    const peakHours: Record<number, Record<number, number>> = {};
    for (let h = 5; h <= 22; h++) {
      peakHours[h] = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    }
    for (const b of confirmedBookings) {
      const st = new Date(b.startTime);
      const hour = st.getUTCHours();
      const day = new Date(b.date).getUTCDay();
      if (peakHours[hour]) peakHours[hour][day]++;
    }

    // --- REPEAT BOOKER RATE ---
    const bookerCounts: Record<string, number> = {};
    for (const b of confirmedBookings) {
      bookerCounts[b.playerId] = (bookerCounts[b.playerId] || 0) + 1;
    }
    const uniqueBookers = Object.keys(bookerCounts).length;
    const repeatBookers = Object.values(bookerCounts).filter((c) => c > 1).length;
    const repeatBookerPct = uniqueBookers > 0 ? Math.round((repeatBookers / uniqueBookers) * 100) : 0;

    // --- CANCELLATION RATE ---
    const totalAllBookings = bookings.length;
    const cancellationPct = totalAllBookings > 0 ? Math.round((cancelledBookings.length / totalAllBookings) * 100) : 0;

    // --- REVENUE BY DAY OF WEEK ---
    const revenueByDow: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const b of cashConfirmedBookings) {
      const dow = new Date(b.date).getUTCDay();
      revenueByDow[dow] += b.priceValue;
    }

    // --- OPEN PLAY / COURTPAY SESSION OVERLAP ---
    let openPlayHours = 0;
    for (const s of openPlaySessions) {
      if (s.closedAt) {
        openPlayHours += (new Date(s.closedAt).getTime() - new Date(s.openedAt).getTime()) / 3600000;
      }
    }
    openPlayHours = Math.round(openPlayHours * 10) / 10;

    // --- COACHING + COURT COMBINED UTILIZATION ---
    const confirmedLessonsOnCourt = coachLessons.filter(
      (l) => (l.status === "confirmed" || l.status === "completed") && l.courtId
    );
    let coachingCourtHours = 0;
    for (const l of confirmedLessonsOnCourt) {
      coachingCourtHours += (new Date(l.endTime).getTime() - new Date(l.startTime).getTime()) / 3600000;
    }
    const combinedBookedHours = totalBookedHours + coachingCourtHours;
    const combinedUtilizationPct = totalAvailableHours > 0
      ? Math.round((combinedBookedHours / totalAvailableHours) * 100)
      : 0;

    // --- MONTH OVER MONTH COMPARISON ---
    const prevConfirmed = prevMonthBookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const prevCancelled = prevMonthBookings.filter((b) => b.status === "cancelled");
      const prevCashConfirmed = prevConfirmed.filter(isCashBooking);
    const prevRevenue = prevCashConfirmed.reduce((s, b) => s + b.priceValue, 0);
    let prevBookedHours = 0;
    for (const b of prevConfirmed) {
      prevBookedHours += (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000;
    }
    let prevCoachCourtHours = 0;
    for (const l of prevMonthLessons) {
      if (l.courtId) prevCoachCourtHours += (new Date(l.endTime).getTime() - new Date(l.startTime).getTime()) / 3600000;
    }
    const prevMonthDays = prevMonthEnd.getUTCDate();
    const prevAvailableHours = bookableCourtCount * hoursPerDayPerCourt * prevMonthDays;
    const prevUtilPct = prevAvailableHours > 0 ? Math.round((prevBookedHours / prevAvailableHours) * 100) : 0;
    const prevCombinedUtilPct = prevAvailableHours > 0
      ? Math.round(((prevBookedHours + prevCoachCourtHours) / prevAvailableHours) * 100)
      : 0;
    const prevCancelPct = prevMonthBookings.length > 0
      ? Math.round((prevCancelled.length / prevMonthBookings.length) * 100)
      : 0;
    const prevMonthLabel = prevMonthStart.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

    // --- MEMBERSHIP ANALYTICS ---
    const activeMembers = memberships.filter((m) => m.status === "active");
    const suspendedMembers = memberships.filter((m) => m.status === "suspended");
    const cancelledMembers = memberships.filter((m) => m.status === "cancelled" || m.status === "expired");

    const tierBreakdown: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const t of membershipTiers) tierBreakdown[t.id] = { name: t.name, count: 0, revenue: 0 };
    for (const m of activeMembers) {
      if (tierBreakdown[m.tierId]) {
        tierBreakdown[m.tierId].count++;
        tierBreakdown[m.tierId].revenue += m.tier.priceValue;
      }
    }

    const membershipMRR = activeMembers.reduce((s, m) => s + m.tier.priceValue, 0);

    // New members in period
    const newMembers = memberships.filter(
      (m) => new Date(m.createdAt) >= dateFrom && new Date(m.createdAt) <= dateTo
    );

    // Session usage
    const totalSessionsUsed = activeMembers.reduce((s, m) => s + m.sessionsUsed, 0);
    const totalSessionsIncluded = activeMembers.reduce((s, m) => s + (m.tier.sessionsIncluded ?? 0), 0);
    const unlimitedCount = activeMembers.filter((m) => m.tier.sessionsIncluded === null).length;

    // --- STAFF ANALYTICS ---
    const staffMap: Record<string, { name: string; hours: number; cost: number; isCoach: boolean }> = {};
    for (const sa of staffAssignments) {
      staffMap[sa.staff.id] = { name: sa.staff.name, hours: 0, cost: 0, isCoach: sa.staff.isCoach };
    }
    for (const sp of staffPayments) {
      if (!staffMap[sp.staffId]) staffMap[sp.staffId] = { name: sp.staff.name, hours: 0, cost: 0, isCoach: false };
      staffMap[sp.staffId].hours += Number(sp.totalHours);
      staffMap[sp.staffId].cost += Number(sp.amount ?? 0);
    }
    const totalStaffHours = Object.values(staffMap).reduce((s, v) => s + v.hours, 0);
    const totalPayrollCost = Object.values(staffMap).reduce((s, v) => s + v.cost, 0);
    const staffCount = staffAssignments.length;
    const coachCount = staffAssignments.filter((s) => s.staff.isCoach).length;

    // --- COACHING ANALYTICS ---
    const confirmedLessons = coachLessons.filter((l) => l.status === "confirmed" || l.status === "completed");
    const cancelledLessons = coachLessons.filter((l) => l.status === "cancelled");

    let totalLessonHours = 0;
    for (const l of confirmedLessons) {
      totalLessonHours += (new Date(l.endTime).getTime() - new Date(l.startTime).getTime()) / 3600000;
    }

    const lessonRevenue = confirmedLessons.reduce((s, l) => s + l.priceValue, 0);
    const paidLessons = confirmedLessons.filter((l) => l.paymentStatus === "paid" || l.paymentStatus === "PAID");
    const unpaidLessons = confirmedLessons.filter((l) => l.paymentStatus === "pending" || l.paymentStatus === "UNPAID");

    const perCoach: Record<string, { name: string; lessons: number; hours: number; revenue: number }> = {};
    for (const l of confirmedLessons) {
      if (!perCoach[l.coachId]) perCoach[l.coachId] = { name: l.coach.name, lessons: 0, hours: 0, revenue: 0 };
      perCoach[l.coachId].lessons++;
      perCoach[l.coachId].hours += (new Date(l.endTime).getTime() - new Date(l.startTime).getTime()) / 3600000;
      perCoach[l.coachId].revenue += l.priceValue;
    }

    const lessonTypeBreakdown = { private: 0, group: 0 };
    for (const l of confirmedLessons) {
      if (l.package.lessonType === "private") lessonTypeBreakdown.private++;
      else lessonTypeBreakdown.group++;
    }

    const lessonsByDate: Record<string, number> = {};
    for (const l of confirmedLessons) {
      const d = new Date(l.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      lessonsByDate[key] = (lessonsByDate[key] || 0) + 1;
    }

    // --- PLAYER ANALYTICS ---
    const newPlayersInPeriod = players.filter(
      (p) => new Date(p.createdAt) >= dateFrom && new Date(p.createdAt) <= dateTo
    );

    const skillBreakdown: Record<string, number> = {};
    const genderBreakdown: Record<string, number> = {};
    for (const p of players) {
      skillBreakdown[p.skillLevel] = (skillBreakdown[p.skillLevel] || 0) + 1;
      genderBreakdown[p.gender] = (genderBreakdown[p.gender] || 0) + 1;
    }

    const walkInCount = players.filter((p) => p.isWalkIn).length;

    const activePlayers = players.filter((p) => p._count.bookings > 0 || p._count.coachLessons > 0);

    const topBookers = players
      .filter((p) => p._count.bookings > 0)
      .sort((a, b) => b._count.bookings - a._count.bookings)
      .slice(0, 10)
      .map((p) => ({ name: p.name, bookings: p._count.bookings, lessons: p._count.coachLessons }));

    const registrationsByDate: Record<string, number> = {};
    for (const p of newPlayersInPeriod) {
      const d = new Date(p.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      registrationsByDate[key] = (registrationsByDate[key] || 0) + 1;
    }

    // --- OPEN PLAY ANALYTICS ---
    const openPlayRevenue = openPlayRegistrations.reduce((s, r) => s + r.priceValue, 0);
    const openPlayPaidCount = openPlayRegistrations.filter(
      (r) => r.paymentStatus === "paid" || r.paymentStatus === "PAID"
    ).length;
    const openPlayUnpaidCount = openPlayRegistrations.filter(
      (r) => r.paymentStatus === "pending" || r.paymentStatus === "unpaid"
    ).length;

    // --- COURTPAY ANALYTICS ---
    // CourtPay walk-in payments use type = "checkin"
    const sessionFeePayments = courtPayPayments.filter((p) => p.type === "checkin");
    const courtPayRevenue = sessionFeePayments.reduce((s, p) => s + p.amount, 0);
    const courtPayTransactions = sessionFeePayments.length;
    const courtPayPlayersServed = sessionFeePayments.reduce((s, p) => s + p.partyCount, 0);

    // --- PROGRAM PASS REVENUE ---
    const programPassRevenue = programPassAgg._sum.amountValue ?? 0;

    // --- TOTAL REVENUE SUMMARY ---
    const totalRevenue =
      bookingRevenue + openPlayRevenue + courtPayRevenue + lessonRevenue
      + openBillCollected + programPassRevenue;

    // --- PERFORMANCE SCORECARD ---
    // Hours per block type (each courtId × duration)
    const blockHoursByType: Record<string, number> = {};
    for (const block of courtBlocks) {
      const dur = (new Date(block.endTime).getTime() - new Date(block.startTime).getTime()) / 3600000;
      const courtCount = block.courtIds.length || 1;
      const hrs = dur * courtCount;
      blockHoursByType[block.type] = (blockHoursByType[block.type] || 0) + hrs;
    }

    // Total hours occupied across all sources
    const totalBlockHours = Object.values(blockHoursByType).reduce((s, h) => s + h, 0);
    const totalAllSourceHours = totalBookedHours + coachingCourtHours + totalBlockHours;
    const perfAvailableHours = totalAvailableHours; // already uses real bookingConfig hours

    const revenuePerCourtHour = totalAllSourceHours > 0
      ? Math.round(totalRevenue / totalAllSourceHours)
      : 0;
    const courtEfficiencyPct = perfAvailableHours > 0
      ? Math.round((totalAllSourceHours / perfAvailableHours) * 100)
      : 0;

    // Revenue recognized = cash + outstanding open-bill accrued (not yet paid)
    const outstandingOpenBill = Math.max(0, openBillAccrued - openBillCollected);
    const revenueRecognized = totalRevenue + outstandingOpenBill;
    const collectedPct = revenueRecognized > 0
      ? Math.round((totalRevenue / revenueRecognized) * 100)
      : 100;

    // Occupancy by source — build list only for sources with hours > 0
    const BLOCK_TYPE_META: Record<string, { label: string; color: string }> = {
      maintenance:          { label: "Maintenance",      color: "#898781" },
      private_event:        { label: "Private event",    color: "#6b7280" },
      private_competition:  { label: "Private comp",     color: "#7c3aed" },
      competition:          { label: "Competition",      color: "#9333ea" },
      open_play:            { label: "Open play (block)",color: "#1baf7a" },
      alobo:                { label: "Alobo",            color: "#0ea5e9" },
      program_pass:         { label: "Program passes",   color: "#4a3aa7" },
    };

    const occupancySources: { source: string; label: string; hours: number; pct: number; color: string }[] = [];

    if (totalBookedHours > 0) {
      occupancySources.push({
        source: "walk_in",
        label: "Walk-in / bookings",
        hours: Math.round(totalBookedHours * 10) / 10,
        pct: perfAvailableHours > 0 ? Math.round((totalBookedHours / perfAvailableHours) * 100) : 0,
        color: "#2a78d6",
      });
    }
    if (coachingCourtHours > 0) {
      occupancySources.push({
        source: "coaching",
        label: "Coaching",
        hours: Math.round(coachingCourtHours * 10) / 10,
        pct: perfAvailableHours > 0 ? Math.round((coachingCourtHours / perfAvailableHours) * 100) : 0,
        color: "#eda100",
      });
    }
    for (const [type, hrs] of Object.entries(blockHoursByType)) {
      if (hrs <= 0) continue;
      const meta = BLOCK_TYPE_META[type] ?? { label: type, color: "#898781" };
      occupancySources.push({
        source: type,
        label: meta.label,
        hours: Math.round(hrs * 10) / 10,
        pct: perfAvailableHours > 0 ? Math.round((hrs / perfAvailableHours) * 100) : 0,
        color: meta.color,
      });
    }
    // Sort by hours desc
    occupancySources.sort((a, b) => b.hours - a.hours);

    // Revenue mix — channels must add up exactly to totalRevenue (cashCollected)
    // MRR is a rate, not collected cash, so it is excluded from the mix.
    const revenueMixSources = [
      { channel: "court_bookings", label: "Court bookings",  revenue: bookingRevenue + openBillCollected, color: "#2a78d6" },
      { channel: "program_passes", label: "Program passes",  revenue: programPassRevenue, color: "#4a3aa7" },
      { channel: "coaching",       label: "Coaching",        revenue: lessonRevenue, color: "#eda100" },
      { channel: "open_play",      label: "Open play",       revenue: openPlayRevenue, color: "#1baf7a" },
      { channel: "court_pay",      label: "CourtPay (walk-in)", revenue: courtPayRevenue, color: "#6366f1" },
    ];
    // totalRevMix should equal totalRevenue; verify for any float drift
    const totalRevMix = revenueMixSources.reduce((s, r) => s + r.revenue, 0);
    const revenueMix = revenueMixSources.map((r) => ({
      ...r,
      pct: totalRevMix > 0 ? Math.round((r.revenue / totalRevMix) * 100) : 0,
    }));

    // Channel performance
    const avgPerBooking = confirmedBookings.length > 0
      ? Math.round((bookingRevenue + openBillCollected) / confirmedBookings.length)
      : 0;
    const avgPerLesson = confirmedLessons.length > 0
      ? Math.round(lessonRevenue / confirmedLessons.length)
      : 0;

    const performance = {
      cashCollected: totalRevenue,
      revenueRecognized,
      outstanding: outstandingOpenBill,
      collectedPct,
      revenuePerCourtHour,
      courtEfficiencyPct,
      totalAvailableHours: perfAvailableHours,
      totalAllSourceHours: Math.round(totalAllSourceHours * 10) / 10,
      occupancyBySource: occupancySources,
      revenueMix,
      channelPerf: {
        courtBookings: {
          revenue: bookingRevenue + openBillCollected,
          bookings: confirmedBookings.length,
          avgPerBooking,
        },
        programPasses: {
          revenue: programPassRevenue,
          unpaidCount: programPassUnpaidCount,
        },
        coaching: {
          revenue: lessonRevenue,
          lessons: confirmedLessons.length,
          avgPerLesson,
        },
        openPlay: {
          revenue: openPlayRevenue,
          registrations: openPlayRegistrations.length,
          paidCount: openPlayPaidCount,
          unpaidCount: openPlayUnpaidCount,
        },
        courtPay: {
          revenue: courtPayRevenue,
          transactions: courtPayTransactions,
          playersServed: courtPayPlayersServed,
        },
      },
      players: {
        total: totalPlayers,
        newInPeriod: newPlayersInPeriod.length,
      },
    };

    return json({
      courtBookings: {
        totalBookings: confirmedBookings.length,
        cancelledBookings: cancelledBookings.length,
        utilizationPct,
        totalBookedHours: Math.round(totalBookedHours * 10) / 10,
        totalAvailableHours,
        bookingRevenue,
        bookingsByDate,
        dailyUtilization,
        perCourt: Object.values(perCourt),
        peakHours,
        repeatBookerPct,
        uniqueBookers,
        repeatBookers,
        cancellationPct,
        revenueByDow,
        openPlayHours,
        openPlaySessions: openPlaySessions.length,
        coachingCourtHours: Math.round(coachingCourtHours * 10) / 10,
        combinedUtilizationPct,
        combinedBookedHours: Math.round(combinedBookedHours * 10) / 10,
        mom: {
          prevMonthLabel,
          currentMonthLabel: monthLabel,
          prev: {
            bookings: prevConfirmed.length,
            cancelled: prevCancelled.length,
            cancelPct: prevCancelPct,
            revenue: prevRevenue,
            hours: Math.round(prevBookedHours * 10) / 10,
            utilPct: prevUtilPct,
            combinedUtilPct: prevCombinedUtilPct,
          },
          current: {
            bookings: monthBookings.length,
            revenue: monthBookings.filter(isCashBooking).reduce((s, b) => s + b.priceValue, 0),
            hours: Math.round(actualMonthHours * 10) / 10,
            utilPct: (() => {
              const curAvail = bookableCourtCount * hoursPerDayPerCourt * todayDate;
              return curAvail > 0 ? Math.round((actualMonthHours / curAvail) * 100) : 0;
            })(),
            cancelPct: cancellationPct,
          },
        },
      },
      memberships: {
        activeCount: activeMembers.length,
        suspendedCount: suspendedMembers.length,
        cancelledCount: cancelledMembers.length,
        newInPeriod: newMembers.length,
        membershipMRR,
        tierBreakdown: Object.values(tierBreakdown),
        sessionUsage: {
          totalUsed: totalSessionsUsed,
          totalIncluded: totalSessionsIncluded,
          unlimitedCount,
        },
      },
      staff: {
        totalStaff: staffCount,
        coachCount,
        totalHours: Math.round(totalStaffHours * 10) / 10,
        totalPayrollCost,
        staffBreakdown: Object.values(staffMap)
          .filter((s) => s.hours > 0 || s.cost > 0)
          .sort((a, b) => b.hours - a.hours),
      },
      coaching: {
        totalLessons: confirmedLessons.length,
        cancelledLessons: cancelledLessons.length,
        totalHours: Math.round(totalLessonHours * 10) / 10,
        lessonRevenue,
        paidCount: paidLessons.length,
        unpaidCount: unpaidLessons.length,
        lessonTypeBreakdown,
        lessonsByDate,
        perCoach: Object.values(perCoach).sort((a, b) => b.lessons - a.lessons),
      },
      players: {
        totalRegistered: totalPlayers,
        newInPeriod: newPlayersInPeriod.length,
        activeInPeriod: activePlayers.length,
        walkInCount,
        skillBreakdown,
        genderBreakdown,
        registrationsByDate,
        topBookers,
      },
      monthProjection: {
        monthLabel,
        daysInMonth,
        todayDate,
        days: monthChartDays,
        actualRevenue: actualMonthRevenue,
        projectedRevenue: Math.round(projectedMonthRevenue),
        actualHours: Math.round(actualMonthHours * 10) / 10,
        projectedHours: Math.round(projectedMonthHours * 10) / 10,
        avgDailyRevenue: Math.round(avgDailyRevenue),
        avgDailyHours: Math.round(avgDailyHours * 10) / 10,
      },
      overview: {
        totalPlayers,
        bookableCourtCount,
      },
      openBill: {
        // Net amount on in-progress / issued / overdue bills in period (after discount + VAT)
        accrued: openBillAccrued,
        // Net amount collected (paid bills) in period
        collected: openBillCollected,
        // Breakdown for reconciliation
        rackSubtotal: openBillRackSubtotal,
        discountTotal: openBillDiscountTotal,
        vatTotal: openBillVatTotal,
      },
      openPlay: {
        totalRegistrations: openPlayRegistrations.length,
        revenue: openPlayRevenue,
        paidCount: openPlayPaidCount,
        unpaidCount: openPlayUnpaidCount,
      },
      courtPay: {
        totalTransactions: courtPayTransactions,
        revenue: courtPayRevenue,
        playersServed: courtPayPlayersServed,
      },
      programPasses: {
        revenue: programPassRevenue,
        unpaidCount: programPassUnpaidCount,
        overdueCount: programPassOverdueCount,
      },
      totalRevenue,
      performance,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg === "Unauthorized" || msg.includes("Unauthorized")) return error(msg, 401);
    return error(msg, 500);
  }
}
