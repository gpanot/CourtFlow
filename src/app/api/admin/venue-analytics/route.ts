import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    if (!from || !to) return error("from and to dates are required");

    const dateFrom = new Date(from + "T00:00:00Z");
    const dateTo = new Date(to + "T23:59:59Z");

    const [
      courts,
      bookings,
      memberships,
      membershipTiers,
      staffPayments,
      staffAssignments,
      totalPlayers,
      coachLessons,
      players,
    ] = await Promise.all([
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
          date: true,
          startTime: true,
          endTime: true,
          status: true,
          priceInCents: true,
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
          tier: { select: { name: true, sessionsIncluded: true, priceInCents: true } },
        },
      }),
      prisma.membershipTier.findMany({
        where: { venueId, isActive: true },
        select: { id: true, name: true, priceInCents: true, sessionsIncluded: true },
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
          date: true,
          startTime: true,
          endTime: true,
          status: true,
          priceInCents: true,
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
    ]);

    // --- COURT BOOKING ANALYTICS ---
    const confirmedBookings = bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const cancelledBookings = bookings.filter((b) => b.status === "cancelled");

    const totalDays = Math.max(1, Math.ceil((dateTo.getTime() - dateFrom.getTime()) / 86400000));
    const bookableCourtCount = courts.length;

    // Assume 12 bookable hours per day per court (6am-6pm as reasonable default)
    const hoursPerDayPerCourt = 12;
    const totalAvailableHours = bookableCourtCount * hoursPerDayPerCourt * totalDays;

    let totalBookedHours = 0;
    for (const b of confirmedBookings) {
      const dur = (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000;
      totalBookedHours += dur;
    }

    const utilizationPct = totalAvailableHours > 0 ? Math.round((totalBookedHours / totalAvailableHours) * 100) : 0;

    const bookingRevenue = confirmedBookings.reduce((s, b) => s + b.priceInCents, 0);

    // Bookings per day
    const bookingsByDate: Record<string, number> = {};
    for (const b of confirmedBookings) {
      const d = new Date(b.date);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      bookingsByDate[key] = (bookingsByDate[key] || 0) + 1;
    }

    // Per-court usage
    const perCourt: Record<string, { label: string; bookings: number; hours: number }> = {};
    for (const c of courts) perCourt[c.id] = { label: c.label, bookings: 0, hours: 0 };
    for (const b of confirmedBookings) {
      if (perCourt[b.courtId]) {
        perCourt[b.courtId].bookings++;
        perCourt[b.courtId].hours += (new Date(b.endTime).getTime() - new Date(b.startTime).getTime()) / 3600000;
      }
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

    // --- MEMBERSHIP ANALYTICS ---
    const activeMembers = memberships.filter((m) => m.status === "active");
    const suspendedMembers = memberships.filter((m) => m.status === "suspended");
    const cancelledMembers = memberships.filter((m) => m.status === "cancelled" || m.status === "expired");

    const tierBreakdown: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const t of membershipTiers) tierBreakdown[t.id] = { name: t.name, count: 0, revenue: 0 };
    for (const m of activeMembers) {
      if (tierBreakdown[m.tierId]) {
        tierBreakdown[m.tierId].count++;
        tierBreakdown[m.tierId].revenue += m.tier.priceInCents;
      }
    }

    const membershipMRR = activeMembers.reduce((s, m) => s + m.tier.priceInCents, 0);

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

    const lessonRevenue = confirmedLessons.reduce((s, l) => s + l.priceInCents, 0);
    const paidLessons = confirmedLessons.filter((l) => l.paymentStatus === "PAID");
    const unpaidLessons = confirmedLessons.filter((l) => l.paymentStatus === "UNPAID");

    const perCoach: Record<string, { name: string; lessons: number; hours: number; revenue: number }> = {};
    for (const l of confirmedLessons) {
      if (!perCoach[l.coachId]) perCoach[l.coachId] = { name: l.coach.name, lessons: 0, hours: 0, revenue: 0 };
      perCoach[l.coachId].lessons++;
      perCoach[l.coachId].hours += (new Date(l.endTime).getTime() - new Date(l.startTime).getTime()) / 3600000;
      perCoach[l.coachId].revenue += l.priceInCents;
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

    return json({
      courtBookings: {
        totalBookings: confirmedBookings.length,
        cancelledBookings: cancelledBookings.length,
        utilizationPct,
        totalBookedHours: Math.round(totalBookedHours * 10) / 10,
        totalAvailableHours,
        bookingRevenue,
        bookingsByDate,
        perCourt: Object.values(perCourt),
        peakHours,
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
      overview: {
        totalPlayers,
        bookableCourtCount,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    if (msg === "Unauthorized" || msg.includes("Unauthorized")) return error(msg, 401);
    return error(msg, 500);
  }
}
