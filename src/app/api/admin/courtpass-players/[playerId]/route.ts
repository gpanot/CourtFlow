import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { getAuthorizedVenueIds } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { playerId } = await params;
    const venueId = request.nextUrl.searchParams.get("venueId");

    if (!venueId) return error("venueId is required", 400);

    if (auth.role !== "superadmin") {
      const authorizedIds = await getAuthorizedVenueIds(auth);
      if (!authorizedIds.includes(venueId)) {
        return error("Forbidden", 403);
      }
    }

    // Fetch venue (for cancellation policy and courts list)
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        name: true,
        settings: true,
        courts: {
          where: { isBookable: true },
          select: { id: true, label: true },
          orderBy: { label: "asc" },
        },
      },
    });
    if (!venue) return notFound("Venue not found");

    const settings = (venue.settings as Record<string, unknown>) ?? {};
    const cancellationPolicy = (settings.cancellationPolicy as {
      freeCancelHours?: number;
      partialCancelHours?: number;
      noCancelHours?: number;
    }) ?? { freeCancelHours: 24, partialCancelHours: 12, noCancelHours: 4 };

    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Determine player source: try Player first, then CheckInPlayer ──
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        name: true,
        phone: true,
        avatar: true,
        facePhotoPath: true,
        avatarPhotoPath: true,
        gender: true,
        skillLevel: true,
        email: true,
        reclubUserId: true,
      },
    });

    if (player) {
      // ── CourtPass player (Player model) ──

      // Upcoming bookings — no limit // v1 limit: all — add cursor pagination in v2
      const upcomingBookings = await prisma.booking.findMany({
        where: {
          playerId,
          venueId,
          status: "confirmed",
          date: { gte: today },
        },
        include: { court: { select: { id: true, label: true } } },
        orderBy: { startTime: "asc" },
      });

      // Past bookings — last 10 // v1 limit: 10 — add cursor pagination in v2
      const pastBookings = await prisma.booking.findMany({
        where: {
          playerId,
          venueId,
          status: { in: ["completed", "cancelled", "no_show"] },
        },
        include: { court: { select: { id: true, label: true } } },
        orderBy: { startTime: "desc" },
        take: 10,
      });

      // Membership
      const membership = await prisma.membership.findUnique({
        where: { playerId_venueId: { playerId, venueId } },
        include: { tier: true },
      });

      // Membership tiers for the adjust modal
      const membershipTiers = await prisma.membershipTier.findMany({
        where: { venueId, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, priceValue: true, sessionsIncluded: true },
      });

      // Check-in history — last 20 (CheckInRecord only, CourtPay) // v1 limit: 20 — add cursor pagination in v2
      // Try to find a linked CheckInPlayer by phone
      const cpPlayer = await prisma.checkInPlayer.findUnique({
        where: { phone_venueId: { phone: player.phone, venueId } },
        select: { id: true },
      });

      const checkInHistory = cpPlayer
        ? await prisma.checkInRecord.findMany({
            where: { playerId: cpPlayer.id, venueId },
            orderBy: { checkedInAt: "desc" },
            take: 20,
            select: {
              id: true,
              checkedInAt: true,
              source: true,
            },
          })
        : [];

      const totalVisits = cpPlayer
        ? await prisma.checkInRecord.count({ where: { playerId: cpPlayer.id, venueId } })
        : 0;

      const lastCheckIn = checkInHistory[0]?.checkedInAt ?? null;

      // Payments — last 20 // v1 limit: 20 — add cursor pagination in v2
      const membershipPayments = membership
        ? await prisma.membershipPayment.findMany({
            where: { membershipId: membership.id },
            orderBy: { periodStart: "desc" },
            take: 20,
            select: {
              id: true,
              amountValue: true,
              status: true,
              periodStart: true,
              periodEnd: true,
              paidAt: true,
              paymentMethod: true,
              note: true,
            },
          })
        : [];

      const bookingPayments = await prisma.booking.findMany({
        where: { playerId, venueId, status: { in: ["confirmed", "completed"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          priceValue: true,
          paymentStatus: true,
          paymentMethod: true,
          startTime: true,
          endTime: true,
          date: true,
          status: true,
          court: { select: { label: true } },
        },
      });

      // Pending balance: overdue membership payments + unpaid bookings
      const overdueAmount = membershipPayments
        .filter((p) => p.status === "OVERDUE" || p.status === "UNPAID")
        .reduce((sum, p) => sum + p.amountValue, 0);

      const unpaidBookingsAmount = bookingPayments
        .filter((b) => b.paymentStatus !== "PAID" && b.paymentStatus !== "paid")
        .reduce((sum, b) => sum + b.priceValue, 0);

      const pendingBalance = overdueAmount + unpaidBookingsAmount;

      // Coaching lessons — all upcoming + last 10 completed // v1 limit: all upcoming + 10 past — add cursor pagination in v2
      const [upcomingLessons, pastLessons] = await Promise.all([
        prisma.coachLesson.findMany({
          where: {
            playerId,
            venueId,
            status: { in: ["confirmed"] },
            startTime: { gte: now },
          },
          include: {
            coach: { select: { id: true, name: true } },
            court: { select: { id: true, label: true } },
            package: { select: { name: true, lessonType: true } },
          },
          orderBy: { startTime: "asc" },
        }),
        prisma.coachLesson.findMany({
          where: {
            playerId,
            venueId,
            status: { in: ["completed", "cancelled", "no_show"] },
          },
          include: {
            coach: { select: { id: true, name: true } },
            court: { select: { id: true, label: true } },
            package: { select: { name: true, lessonType: true } },
          },
          orderBy: { startTime: "desc" },
          take: 10,
        }),
      ]);

      // Staff note for this venue
      const staffNote = await prisma.playerNote.findUnique({
        where: { playerId_venueId: { playerId, venueId } },
        select: { content: true, updatedAt: true, updatedBy: true },
      });

      return json({
        source: "courtpass" as const,
        player: {
          id: player.id,
          name: player.name,
          phone: player.phone,
          avatar: player.avatar,
          facePhotoPath: player.facePhotoPath,
          avatarPhotoPath: player.avatarPhotoPath,
          gender: player.gender,
          skillLevel: player.skillLevel,
          email: player.email,
          reclubUserId: player.reclubUserId ?? null,
        },
        stats: {
          totalVisits,
          lastCheckIn: lastCheckIn?.toISOString() ?? null,
          membershipName: membership?.tier?.name ?? null,
          membershipStatus: membership?.status ?? null,
          pendingBalance,
        },
        upcomingBookings: upcomingBookings.map((b) => ({
          id: b.id,
          courtLabel: b.court.label,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          date: b.date.toISOString(),
          priceValue: b.priceValue,
          paymentStatus: b.paymentStatus,
        })),
        pastBookings: pastBookings.map((b) => ({
          id: b.id,
          courtLabel: b.court.label,
          startTime: b.startTime.toISOString(),
          endTime: b.endTime.toISOString(),
          date: b.date.toISOString(),
          status: b.status,
          priceValue: b.priceValue,
          paymentStatus: b.paymentStatus,
        })),
        membership: membership
          ? {
              id: membership.id,
              tierName: membership.tier.name,
              tierId: membership.tierId,
              status: membership.status,
              sessionsUsed: membership.sessionsUsed,
              sessionsIncluded: membership.tier.sessionsIncluded,
              renewalDate: membership.renewalDate.toISOString(),
              activatedAt: membership.activatedAt.toISOString(),
            }
          : null,
        membershipTiers,
        checkInHistory: checkInHistory.map((c) => ({
          id: c.id,
          checkedInAt: c.checkedInAt.toISOString(),
          source: c.source,
          venueName: venue.name,
        })),
        payments: [
          ...membershipPayments.map((p) => ({
            id: p.id,
            type: "membership" as const,
            description: `Membership — ${new Date(p.periodStart).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`,
            amount: p.amountValue,
            status: p.status,
            date: p.periodStart.toISOString(),
            paidAt: p.paidAt?.toISOString() ?? null,
            paymentMethod: p.paymentMethod,
            note: p.note,
          })),
          ...bookingPayments.map((b) => ({
            id: b.id,
            type: "booking" as const,
            description: `Court booking — ${b.court.label}`,
            amount: b.priceValue,
            status: b.paymentStatus ?? "UNPAID",
            date: b.date.toISOString(),
            startTime: b.startTime.toISOString(),
            endTime: b.endTime.toISOString(),
            bookingStatus: b.status,
            courtLabel: b.court.label,
            paidAt: null,
            paymentMethod: b.paymentMethod,
            note: null,
          })),
        ]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 20),
        coachingLessons: [
          ...upcomingLessons.map((l) => ({
            id: l.id,
            coachName: l.coach.name,
            note: l.note,
            date: l.date.toISOString(),
            startTime: l.startTime.toISOString(),
            endTime: l.endTime.toISOString(),
            status: l.status,
            paymentStatus: l.paymentStatus,
            priceValue: l.priceValue,
            courtLabel: l.court?.label ?? null,
            packageName: l.package.name,
            lessonType: l.package.lessonType,
          })),
          ...pastLessons.map((l) => ({
            id: l.id,
            coachName: l.coach.name,
            note: l.note,
            date: l.date.toISOString(),
            startTime: l.startTime.toISOString(),
            endTime: l.endTime.toISOString(),
            status: l.status,
            paymentStatus: l.paymentStatus,
            priceValue: l.priceValue,
            courtLabel: l.court?.label ?? null,
            packageName: l.package.name,
            lessonType: l.package.lessonType,
          })),
        ],
        staffNote: staffNote
          ? {
              content: staffNote.content,
              updatedAt: staffNote.updatedAt.toISOString(),
              updatedBy: staffNote.updatedBy,
            }
          : null,
        venueCourts: venue.courts,
        cancellationPolicy,
      });
    }

    // ── CourtPay player (CheckInPlayer model) ──
    const cpPlayer2 = await prisma.checkInPlayer.findUnique({
      where: { id: playerId },
      select: {
        id: true,
        name: true,
        phone: true,
        gender: true,
        skillLevel: true,
        venueId: true,
        _count: { select: { checkIns: true } },
      },
    });

    if (!cpPlayer2 || cpPlayer2.venueId !== venueId) {
      return notFound("Player not found");
    }

    // Check-in history — last 20 // v1 limit: 20 — add cursor pagination in v2
    const checkInHistory2 = await prisma.checkInRecord.findMany({
      where: { playerId: cpPlayer2.id, venueId },
      orderBy: { checkedInAt: "desc" },
      take: 20,
      select: { id: true, checkedInAt: true, source: true },
    });

    return json({
      source: "courtpay" as const,
      player: {
        id: cpPlayer2.id,
        name: cpPlayer2.name,
        phone: cpPlayer2.phone,
        avatar: null,
        facePhotoPath: null,
        avatarPhotoPath: null,
        gender: cpPlayer2.gender,
        skillLevel: cpPlayer2.skillLevel,
        email: null,
      },
      stats: {
        totalVisits: cpPlayer2._count.checkIns,
        lastCheckIn: checkInHistory2[0]?.checkedInAt?.toISOString() ?? null,
        membershipName: null,
        membershipStatus: null,
        pendingBalance: 0,
      },
      upcomingBookings: [],
      pastBookings: [],
      membership: null,
      membershipTiers: [],
      checkInHistory: checkInHistory2.map((c) => ({
        id: c.id,
        checkedInAt: c.checkedInAt.toISOString(),
        source: c.source,
        venueName: venue.name,
      })),
      payments: [],
      coachingLessons: [],
      staffNote: null,
      venueCourts: venue.courts,
      cancellationPolicy,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    if (auth.role !== "manager" && auth.role !== "superadmin") {
      return error("Forbidden", 403);
    }

    const { playerId } = await params;

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return notFound("Player not found");

    // Delete in the correct dependency order to avoid FK violations.
    // Many relations already have onDelete: Cascade on the FK side, so those
    // will be cleaned up automatically when we delete the Player row. The ones
    // below do NOT cascade and must be handled explicitly first.
    await prisma.$transaction(async (tx) => {
      // Coach lessons — delete (player is being fully wiped, FK is non-nullable)
      await tx.coachLesson.deleteMany({ where: { playerId } });

      // Bookings: delete individual bookings first, then booking groups
      await tx.booking.deleteMany({ where: { playerId } });
      await tx.bookingGroup.deleteMany({ where: { playerId } });

      // Open play registrations
      await tx.openPlayRegistration.deleteMany({ where: { playerId } });

      // Membership payments → memberships
      const memberships = await tx.membership.findMany({
        where: { playerId },
        select: { id: true },
      });
      if (memberships.length) {
        await tx.membershipPayment.deleteMany({
          where: { membershipId: { in: memberships.map((m) => m.id) } },
        });
        await tx.membership.deleteMany({ where: { playerId } });
      }

      // Program passes (payments + check-ins cascade automatically via FK)
      await tx.programPass.deleteMany({ where: { playerId } });

      // Finally delete the player (remaining cascade relations auto-delete)
      await tx.player.delete({ where: { id: playerId } });
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
