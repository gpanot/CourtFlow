import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = requireSuperAdmin(request.headers);

    const ownedVenues = await prisma.venue.findMany({
      where: { staff: { some: { id: auth.id } } },
      select: { id: true },
    });
    const venueIds = ownedVenues.map((v) => v.id);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const bookingWhere = { venueId: { in: venueIds } };

    const [
      todayBookings,
      weekBookings,
      monthBookings,
      upcomingToday,
      tomorrowBookingCount,
      cancelledThisWeek,
      noShowThisWeek,
      recentBookings,
      activeMemberships,
      unpaidMemberPayments,
      overdueMemberPayments,
      membershipsPaidThisMonth,
      expiringMemberships,
      venues,
      staffCount,
      unpaidPayroll,
      todayLessons,
      weekLessons,
      unpaidLessons,
      lessonsPaidThisMonth,
    ] = await Promise.all([
      // Today's bookings (confirmed + completed)
      prisma.booking.findMany({
        where: { ...bookingWhere, date: { gte: todayStart, lte: todayEnd }, status: { in: ["confirmed", "completed"] } },
        select: { priceInCents: true },
      }),
      // This week's bookings
      prisma.booking.findMany({
        where: { ...bookingWhere, date: { gte: weekStart, lte: weekEnd }, status: { in: ["confirmed", "completed"] } },
        select: { priceInCents: true },
      }),
      // This month's bookings
      prisma.booking.findMany({
        where: { ...bookingWhere, date: { gte: monthStart, lte: monthEnd }, status: { in: ["confirmed", "completed"] } },
        select: { priceInCents: true },
      }),
      // Upcoming bookings today (after now)
      prisma.booking.findMany({
        where: { ...bookingWhere, date: { gte: todayStart, lte: todayEnd }, startTime: { gt: now }, status: "confirmed" },
        include: {
          player: { select: { name: true, avatar: true } },
          court: { select: { label: true } },
          venue: { select: { name: true } },
        },
        orderBy: { startTime: "asc" },
        take: 6,
      }),
      // Tomorrow booking count
      prisma.booking.count({
        where: { ...bookingWhere, date: { gte: tomorrowStart, lte: tomorrowEnd }, status: "confirmed" },
      }),
      // Cancelled this week
      prisma.booking.count({
        where: { ...bookingWhere, cancelledAt: { gte: weekStart, lte: weekEnd }, status: "cancelled" },
      }),
      // No-show this week
      prisma.booking.count({
        where: { ...bookingWhere, date: { gte: weekStart, lte: weekEnd }, status: "no_show" },
      }),
      // Recent bookings (latest 8)
      prisma.booking.findMany({
        where: bookingWhere,
        include: {
          player: { select: { name: true, avatar: true } },
          court: { select: { label: true } },
          venue: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      // Active memberships
      prisma.membership.count({
        where: { venueId: { in: venueIds }, status: "active" },
      }),
      // Unpaid membership payments
      prisma.membershipPayment.findMany({
        where: {
          membership: { venueId: { in: venueIds } },
          status: "UNPAID",
          periodEnd: { gte: now },
        },
        select: { amountInCents: true },
      }),
      // Overdue membership payments
      prisma.membershipPayment.findMany({
        where: {
          membership: { venueId: { in: venueIds } },
          status: "UNPAID",
          periodEnd: { lt: now },
        },
        select: { amountInCents: true },
      }),
      // Membership payments collected this month
      prisma.membershipPayment.findMany({
        where: {
          membership: { venueId: { in: venueIds } },
          status: "PAID",
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        select: { amountInCents: true },
      }),
      // Memberships expiring within 7 days
      prisma.membership.count({
        where: {
          venueId: { in: venueIds },
          status: "active",
          renewalDate: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Venues with courts
      prisma.venue.findMany({
        where: { id: { in: venueIds } },
        include: {
          courts: { select: { id: true, isBookable: true } },
        },
      }),
      // Staff count
      prisma.staffMember.count({
        where: { venues: { some: { id: { in: venueIds } } }, role: "staff" },
      }),
      // Unpaid payroll
      prisma.staffPayment.findMany({
        where: {
          staff: { venues: { some: { id: { in: venueIds } } } },
          status: "UNPAID",
        },
        select: { amount: true },
      }),
      // Today's coaching lessons
      prisma.coachLesson.count({
        where: { venueId: { in: venueIds }, date: { gte: todayStart, lte: todayEnd }, status: { in: ["confirmed", "completed"] } },
      }),
      // This week's coaching lessons
      prisma.coachLesson.count({
        where: { venueId: { in: venueIds }, date: { gte: weekStart, lte: weekEnd }, status: { in: ["confirmed", "completed"] } },
      }),
      // Unpaid lessons
      prisma.coachLesson.findMany({
        where: { venueId: { in: venueIds }, paymentStatus: "UNPAID", status: { in: ["confirmed", "completed"] } },
        select: { priceInCents: true },
      }),
      // Lessons paid this month
      prisma.coachLesson.findMany({
        where: { venueId: { in: venueIds }, paymentStatus: "PAID", paidAt: { gte: monthStart, lte: monthEnd } },
        select: { priceInCents: true },
      }),
    ]);

    const todayBookingRevenue = todayBookings.reduce((s, b) => s + b.priceInCents, 0);
    const weekBookingRevenue = weekBookings.reduce((s, b) => s + b.priceInCents, 0);
    const monthBookingRevenue = monthBookings.reduce((s, b) => s + b.priceInCents, 0);
    const membershipRevenue = membershipsPaidThisMonth.reduce((s, p) => s + p.amountInCents, 0);
    const coachingRevenue = lessonsPaidThisMonth.reduce((s, l) => s + l.priceInCents, 0);

    return json({
      revenue: {
        todayBookings: todayBookingRevenue,
        weekBookings: weekBookingRevenue,
        monthBookings: monthBookingRevenue,
        monthMemberships: membershipRevenue,
        monthCoaching: coachingRevenue,
        monthTotal: monthBookingRevenue + membershipRevenue + coachingRevenue,
      },
      bookings: {
        todayCount: todayBookings.length,
        todayRevenue: todayBookingRevenue,
        upcomingToday: upcomingToday.map((b) => ({
          id: b.id,
          playerName: b.player.name,
          playerAvatar: b.player.avatar,
          courtLabel: b.court.label,
          venueName: b.venue.name,
          startTime: b.startTime,
          endTime: b.endTime,
          priceInCents: b.priceInCents,
        })),
        tomorrowCount: tomorrowBookingCount,
        weekCount: weekBookings.length,
        cancelledThisWeek,
        noShowThisWeek,
      },
      memberships: {
        totalActive: activeMemberships,
        unpaidCount: unpaidMemberPayments.length,
        unpaidAmount: unpaidMemberPayments.reduce((s, p) => s + p.amountInCents, 0),
        overdueCount: overdueMemberPayments.length,
        overdueAmount: overdueMemberPayments.reduce((s, p) => s + p.amountInCents, 0),
        expiringThisWeek: expiringMemberships,
      },
      venues: venues.map((v) => ({
        id: v.id,
        name: v.name,
        totalCourts: v.courts.length,
        bookableCourts: v.courts.filter((c) => c.isBookable).length,
      })),
      staff: {
        totalCount: staffCount,
        unpaidPayrollCount: unpaidPayroll.length,
        unpaidPayrollAmount: unpaidPayroll.reduce(
          (s, p) => s + (p.amount ? Number(p.amount) * 100 : 0), 0
        ),
      },
      coaching: {
        lessonsToday: todayLessons,
        lessonsThisWeek: weekLessons,
        unpaidCount: unpaidLessons.length,
        unpaidAmount: unpaidLessons.reduce((s, l) => s + l.priceInCents, 0),
      },
      recentBookings: recentBookings.map((b) => ({
        id: b.id,
        playerName: b.player.name,
        playerAvatar: b.player.avatar,
        courtLabel: b.court.label,
        venueName: b.venue.name,
        date: b.date,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        priceInCents: b.priceInCents,
      })),
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
