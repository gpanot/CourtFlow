import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";
import { resolveOpenPlaySessions } from "@/lib/open-play";
import { resolveHoldExpiresAt } from "@/lib/payment-hold";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = await await requireAdminAccess(request.headers);
    const venueIds = await getAuthorizedVenueIds(auth);

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

    // Exclude expired pending-payment holds (not yet cleaned up by cron).
    // OR instead of NOT — SQL NULLs in paymentStatus/holdExpiresAt break compound NOT filters.
    const activeBookingFilter = {
      OR: [
        { paymentStatus: { not: "pending" } },
        { paymentStatus: null },
        { holdExpiresAt: null },
        { holdExpiresAt: { gte: now } },
      ],
    };

    const bookingWhere = {
      venueId: { in: venueIds },
      ...activeBookingFilter,
    };

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
      recentLessons,
      upcomingLessonsToday,
      todayOpenPlay,
      recentOpenPlay,
    ] = await Promise.all([
      // Today's bookings (confirmed + completed)
      prisma.booking.findMany({
        where: { ...bookingWhere, date: { gte: todayStart, lte: todayEnd }, status: { in: ["confirmed", "completed"] } },
        select: { priceValue: true },
      }),
      // This week's bookings
      prisma.booking.findMany({
        where: { ...bookingWhere, date: { gte: weekStart, lte: weekEnd }, status: { in: ["confirmed", "completed"] } },
        select: { priceValue: true },
      }),
      // This month's bookings
      prisma.booking.findMany({
        where: { ...bookingWhere, date: { gte: monthStart, lte: monthEnd }, status: { in: ["confirmed", "completed"] } },
        select: { priceValue: true },
      }),
      // Upcoming bookings today (after now)
      prisma.booking.findMany({
        where: { ...bookingWhere, date: { gte: todayStart, lte: todayEnd }, startTime: { gt: now }, status: "confirmed" },
        include: {
          player: { select: { name: true, phone: true, avatar: true, avatarPhotoPath: true, facePhotoPath: true } },
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
      // Recent bookings (latest 20 — deduped to 10 after collapsing group siblings)
      prisma.booking.findMany({
        where: {
          venueId: { in: venueIds },
          OR: [
            // Normal confirmed/completed/cancelled/no_show bookings
            { status: { in: ["confirmed", "completed", "cancelled", "no_show"] } },
            // Expired hold records — always show for analytics
            { status: "expired_hold" },
            // Active pending-payment holds (timer still running) — status is confirmed, paymentStatus is pending
            { paymentStatus: "pending", holdExpiresAt: { gte: now } },
          ],
        },
        include: {
          player: { select: { name: true, phone: true, avatar: true, avatarPhotoPath: true, facePhotoPath: true } },
          court: { select: { label: true } },
          venue: { select: { name: true } },
          bookingGroup: { select: { id: true, paymentStatus: true, totalPriceValue: true, paymentRef: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
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
        select: { amountValue: true },
      }),
      // Overdue membership payments
      prisma.membershipPayment.findMany({
        where: {
          membership: { venueId: { in: venueIds } },
          status: "UNPAID",
          periodEnd: { lt: now },
        },
        select: { amountValue: true },
      }),
      // Membership payments collected this month
      prisma.membershipPayment.findMany({
        where: {
          membership: { venueId: { in: venueIds } },
          status: "PAID",
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        select: { amountValue: true },
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
        where: { venueAssignments: { some: { venueId: { in: venueIds } } }, role: "staff" },
      }),
      // Unpaid payroll
      prisma.staffPayment.findMany({
        where: {
          staff: { venueAssignments: { some: { venueId: { in: venueIds } } } },
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
        where: { venueId: { in: venueIds }, paymentStatus: { in: ["UNPAID", "pending", "proof_submitted"] }, status: { in: ["confirmed", "completed"] } },
        select: { priceValue: true },
      }),
      // Lessons paid this month
      prisma.coachLesson.findMany({
        where: { venueId: { in: venueIds }, paymentStatus: { in: ["PAID", "paid"] }, paidAt: { gte: monthStart, lte: monthEnd } },
        select: { priceValue: true },
      }),
      // Recent coaching lessons (latest 8)
      prisma.coachLesson.findMany({
        where: { venueId: { in: venueIds } },
        include: {
          coach: { select: { name: true } },
          player: { select: { name: true, phone: true, avatar: true, avatarPhotoPath: true, facePhotoPath: true } },
          court: { select: { label: true } },
          venue: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      // Today's upcoming coaching lessons (confirmed, after now)
      prisma.coachLesson.findMany({
        where: {
          venueId: { in: venueIds },
          date: { gte: todayStart, lte: todayEnd },
          startTime: { gt: now },
          status: "confirmed",
        },
        include: {
          coach: { select: { name: true } },
          player: { select: { name: true, avatar: true, avatarPhotoPath: true, facePhotoPath: true } },
          venue: { select: { name: true } },
        },
        orderBy: { startTime: "asc" },
        take: 10,
      }),
      // Today's open play registrations (all statuses) — for the "Open Play Today" section
      prisma.openPlayRegistration.findMany({
        where: {
          venueId: { in: venueIds },
          date: { gte: todayStart, lte: todayEnd },
        },
        include: {
          player: { select: { name: true, phone: true, avatar: true, avatarPhotoPath: true, facePhotoPath: true } },
          venue: { select: { name: true } },
        },
        orderBy: { startTime: "asc" },
      }),
      // Recent open play registrations (latest 8)
      prisma.openPlayRegistration.findMany({
        where: { venueId: { in: venueIds } },
        include: {
          player: { select: { name: true, phone: true, avatar: true, avatarPhotoPath: true, facePhotoPath: true } },
          venue: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ]);

    const todayBookingRevenue = todayBookings.reduce((s, b) => s + b.priceValue, 0);
    const weekBookingRevenue = weekBookings.reduce((s, b) => s + b.priceValue, 0);
    const monthBookingRevenue = monthBookings.reduce((s, b) => s + b.priceValue, 0);
    const membershipRevenue = membershipsPaidThisMonth.reduce((s, p) => s + p.amountValue, 0);
    const coachingRevenue = lessonsPaidThisMonth.reduce((s, l) => s + l.priceValue, 0);

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
          playerPhoto: b.player.avatarPhotoPath || b.player.facePhotoPath || null,
          courtLabel: b.court.label,
          venueName: b.venue.name,
          startTime: b.startTime,
          endTime: b.endTime,
          priceValue: b.priceValue,
        })),
        tomorrowCount: tomorrowBookingCount,
        weekCount: weekBookings.length,
        cancelledThisWeek,
        noShowThisWeek,
      },
      memberships: {
        totalActive: activeMemberships,
        unpaidCount: unpaidMemberPayments.length,
        unpaidAmount: unpaidMemberPayments.reduce((s, p) => s + p.amountValue, 0),
        overdueCount: overdueMemberPayments.length,
        overdueAmount: overdueMemberPayments.reduce((s, p) => s + p.amountValue, 0),
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
        unpaidAmount: unpaidLessons.reduce((s, l) => s + l.priceValue, 0),
        upcomingToday: upcomingLessonsToday.map((l) => ({
          id: l.id,
          playerName: l.player.name,
          playerAvatar: l.player.avatar,
          playerPhoto: l.player.avatarPhotoPath || l.player.facePhotoPath || null,
          coachName: l.coach.name,
          venueName: l.venue.name,
          startTime: l.startTime,
          endTime: l.endTime,
          priceValue: l.priceValue,
        })),
      },
      recentBookings: (() => {
        // Collapse group bookings: keep the first occurrence per bookingGroupId, aggregate court labels
        const seenGroups = new Set<string>();
        const collapsed: Array<{
          id: string; venueId: string; playerId: string;
          playerName: string; playerPhone: string; playerAvatar: string; playerPhoto: string | null;
          courtLabel: string; allCourtLabels: string[];
          venueName: string; date: Date; startTime: Date; endTime: Date;
          status: string; paymentStatus: string | null; paymentProofUrl: string | null;
          paymentMethod: string | null;
          holdExpiresAt: Date | null; priceValue: number; createdAt: Date;
          bookingGroupId: string | null; groupPaymentStatus: string | null; groupTotalPrice: number | null;
          isGroup: boolean;
        }> = [];

        for (const b of recentBookings) {
          const bid = b as typeof b & { bookingGroupId?: string | null; bookingGroup?: { id: string; paymentStatus: string; totalPriceValue: number; paymentRef: string } | null };
          if (bid.bookingGroupId) {
            if (seenGroups.has(bid.bookingGroupId)) continue;
            seenGroups.add(bid.bookingGroupId);
            // Collect all court labels from siblings in this same batch
            const siblingLabels = recentBookings
              .filter((s) => (s as typeof s & { bookingGroupId?: string | null }).bookingGroupId === bid.bookingGroupId && s.id !== b.id)
              .map((s) => s.court.label);
            collapsed.push({
              id: b.id, venueId: b.venueId, playerId: b.playerId,
              playerName: b.player.name, playerPhone: b.player.phone,
              playerAvatar: b.player.avatar, playerPhoto: b.player.avatarPhotoPath || b.player.facePhotoPath || null,
              courtLabel: b.court.label,
              allCourtLabels: [b.court.label, ...siblingLabels],
              venueName: b.venue.name, date: b.date, startTime: b.startTime, endTime: b.endTime,
              status: b.status,
              paymentStatus: bid.bookingGroup?.paymentStatus ?? b.paymentStatus,
              paymentProofUrl: b.paymentProofUrl,
              paymentMethod: b.paymentMethod ?? null,
              holdExpiresAt: b.holdExpiresAt,
              priceValue: bid.bookingGroup?.totalPriceValue ?? b.priceValue,
              createdAt: b.createdAt,
              bookingGroupId: bid.bookingGroupId,
              groupPaymentStatus: bid.bookingGroup?.paymentStatus ?? null,
              groupTotalPrice: bid.bookingGroup?.totalPriceValue ?? null,
              isGroup: true,
            });
          } else {
            collapsed.push({
              id: b.id, venueId: b.venueId, playerId: b.playerId,
              playerName: b.player.name, playerPhone: b.player.phone,
              playerAvatar: b.player.avatar, playerPhoto: b.player.avatarPhotoPath || b.player.facePhotoPath || null,
              courtLabel: b.court.label,
              allCourtLabels: [b.court.label],
              venueName: b.venue.name, date: b.date, startTime: b.startTime, endTime: b.endTime,
              status: b.status, paymentStatus: b.paymentStatus, paymentProofUrl: b.paymentProofUrl,
              paymentMethod: b.paymentMethod ?? null,
              holdExpiresAt: b.holdExpiresAt,
              priceValue: b.priceValue, createdAt: b.createdAt,
              bookingGroupId: null, groupPaymentStatus: null, groupTotalPrice: null,
              isGroup: false,
            });
          }
        }

        return collapsed.slice(0, 10).map((b) => ({
          id: b.id, venueId: b.venueId, playerId: b.playerId,
          playerName: b.playerName, playerPhone: b.playerPhone,
          playerAvatar: b.playerAvatar, playerPhoto: b.playerPhoto,
          courtLabel: b.courtLabel,
          allCourtLabels: b.allCourtLabels,
          venueName: b.venueName, date: b.date, startTime: b.startTime, endTime: b.endTime,
          status: b.status, paymentStatus: b.paymentStatus, paymentProofUrl: b.paymentProofUrl,
          paymentMethod: b.paymentMethod,
          holdExpiresAt: resolveHoldExpiresAt({
            paymentStatus: b.paymentStatus, holdExpiresAt: b.holdExpiresAt,
            createdAt: b.createdAt, kind: "booking",
          })?.toISOString() ?? null,
          priceValue: b.priceValue, createdAt: b.createdAt,
          bookingGroupId: b.bookingGroupId,
          isGroup: b.isGroup,
        }));
      })(),
      recentLessons: recentLessons.map((l) => ({
        id: l.id,
        venueId: l.venueId,
        playerId: l.playerId,
        playerName: l.player.name,
        playerPhone: l.player.phone,
        playerAvatar: l.player.avatar,
        playerPhoto: l.player.avatarPhotoPath || l.player.facePhotoPath || null,
        coachName: l.coach.name,
        venueName: l.venue.name,
        courtLabel: l.court?.label ?? null,
        date: l.date,
        startTime: l.startTime,
        endTime: l.endTime,
        status: l.status,
        paymentStatus: l.paymentStatus,
        paymentMethod: l.paymentMethod ?? null,
        proofUrl: l.proofUrl ?? null,
        holdExpiresAt: resolveHoldExpiresAt({
          paymentStatus: l.paymentStatus,
          holdExpiresAt: null,
          createdAt: l.createdAt,
          kind: "lesson",
        })?.toISOString() ?? null,
        priceValue: l.priceValue,
        createdAt: l.createdAt,
      })),
      // Build "Open Play Today" from schedule slots (includes empty sessions)
      openPlayToday: await (async () => {
        // For each venue, get schedule-defined sessions for today
        const venueNames = Object.fromEntries(venues.map((v) => [v.id, v.name]));
        const allSessions = (
          await Promise.all(
            venueIds.map((vid) => resolveOpenPlaySessions(vid, now).catch(() => []))
          )
        ).flat();

        // Build a lookup of registrations by scheduleEntryId
        const regsByEntryId = new Map<string, typeof todayOpenPlay>();
        for (const r of todayOpenPlay) {
          if (!regsByEntryId.has(r.scheduleEntryId)) regsByEntryId.set(r.scheduleEntryId, []);
          regsByEntryId.get(r.scheduleEntryId)!.push(r);
        }

        return allSessions.map((session) => {
          const regs = regsByEntryId.get(session.entryId) ?? [];
          const venueId = todayOpenPlay.find((r) => r.scheduleEntryId === session.entryId)?.venueId
            ?? venueIds[0];
          return {
            scheduleEntryId: session.entryId,
            title: session.title,
            startTime: session.startTime.toISOString(),
            endTime: session.endTime.toISOString(),
            venueName: venueNames[venueId] ?? "",
            priceValue: session.priceValue,
            maxPlayers: session.maxPlayers,
            registrations: regs.map((r) => ({
              id: r.id,
              playerName: r.player.name,
              playerPhone: r.player.phone,
              playerAvatar: r.player.avatar,
              playerPhoto: r.player.avatarPhotoPath || r.player.facePhotoPath || null,
              paymentStatus: r.paymentStatus,
              paymentMethod: r.paymentMethod ?? null,
              paymentProofUrl: r.paymentProofUrl ?? null,
              status: r.status,
            })),
          };
        });
      })(),
      recentOpenPlay: recentOpenPlay.map((r) => ({
        id: r.id,
        venueId: r.venueId,
        playerId: r.playerId,
        playerName: r.player.name,
        playerPhone: r.player.phone,
        playerAvatar: r.player.avatar,
        playerPhoto: r.player.avatarPhotoPath || r.player.facePhotoPath || null,
        venueName: r.venue.name,
        date: r.date,
        startTime: r.startTime,
        endTime: r.endTime,
        status: r.status,
        paymentStatus: r.paymentStatus,
        paymentMethod: r.paymentMethod ?? null,
        paymentProofUrl: r.paymentProofUrl ?? null,
        holdExpiresAt: resolveHoldExpiresAt({
          paymentStatus: r.paymentStatus,
          holdExpiresAt: r.holdExpiresAt,
          createdAt: r.createdAt,
          kind: "openplay",
        })?.toISOString() ?? null,
        priceValue: r.priceValue,
        createdAt: r.createdAt,
      })),
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("authorization") || msg.includes("token") || msg.includes("access required")) {
      return error(msg, 401);
    }
    return error(msg, 500);
  }
}
