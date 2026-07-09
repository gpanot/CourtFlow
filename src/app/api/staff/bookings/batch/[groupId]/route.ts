import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import {
  getBookingConfig,
  resolveGroupBookingPrice,
  resolveCourtPricingMatrix,
  validateMultiCourtBooking,
  GRID_GRANULARITY_MINUTES,
  type MultiCourtEntry,
  type PricingMatrix,
} from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { groupId } = await params;
    const body = await parseBody<{
      /** Set to "cancel" to cancel the group with a reason instead of editing */
      action?: "cancel";
      /** Required when action=cancel and booking was paid: "refund" | "free_pass" | "staff_mistake" */
      cancellationReason?: string;
      date?: string;
      /** Legacy: shared start time for all courts */
      startTime?: string;
      /** Legacy: shared slot count for all courts */
      slotCount?: number;
      /** Legacy: court IDs without per-court windows */
      courtIds?: string[];
      /** New: per-court windows (takes precedence over courtIds + startTime + slotCount) */
      courts?: { courtId: string; startTime: string; slotCount: number }[];
      playerId?: string;
    }>(request);

    const group = await prisma.bookingGroup.findUnique({
      where: { id: groupId },
      include: { bookings: true },
    });
    if (!group) return notFound("Group booking not found");
    if (group.status === "cancelled") return error("Cannot edit a cancelled group booking", 400);

    // --- Cancel action with reason ---
    if (body.action === "cancel") {
      const wasPaid = group.paymentStatus === "paid" || group.paymentStatus === "PAID";
      if (wasPaid) {
        const validReasons = ["refund", "free_pass", "staff_mistake"];
        if (!body.cancellationReason || !validReasons.includes(body.cancellationReason)) {
          return error("cancellationReason is required for paid group bookings: refund | free_pass | staff_mistake", 400);
        }
      }

      const now = new Date();
      const newPaymentStatus = wasPaid ? "refunded" : group.paymentStatus;
      await prisma.$transaction([
        prisma.booking.updateMany({
          where: { bookingGroupId: groupId },
          data: {
            status: "cancelled",
            cancelledAt: now,
            paymentStatus: newPaymentStatus ?? undefined,
            cancellationReason: body.cancellationReason ?? null,
          },
        }),
        prisma.bookingGroup.update({
          where: { id: groupId },
          data: {
            status: "cancelled",
            cancelledAt: now,
            paymentStatus: newPaymentStatus,
            cancellationReason: body.cancellationReason ?? null,
          },
        }),
      ]);

      return json({ success: true, paymentStatus: newPaymentStatus, cancellationReason: body.cancellationReason ?? null });
    }

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: group.venueId },
      select: { settings: true, timezone: true },
    });
    const venueTimezone = venue.timezone ?? "Asia/Ho_Chi_Minh";
    const config = getBookingConfig(venue.settings as Record<string, unknown>);

    // Resolve new values falling back to existing
    const dateKey = body.date
      ? body.date.split("T")[0]
      : group.date.toISOString().split("T")[0];
    // Use noon local time for both write and conflict-check query (workspace rule: no UTC midnight)
    const dateForWrite = new Date(dateKey + "T12:00:00+07:00");

    const newPlayerId = body.playerId ?? group.playerId;

    // Build courtsInput: new per-court format takes precedence over legacy shared-window format
    const existingCourtIds = group.bookings.map((b) => b.courtId);
    let courtsInput: MultiCourtEntry[];

    if (body.courts && body.courts.length > 0) {
      // New format: each court carries its own startTime + slotCount
      courtsInput = body.courts.map((c) => ({
        courtId: c.courtId,
        startTime: c.startTime,
        slotCount: c.slotCount,
      }));
    } else {
      // Legacy format: shared start time + slot count applied to all courts
      const newStartTime = body.startTime ? new Date(body.startTime) : group.startTime;
      const existingDurationMs = group.endTime.getTime() - group.startTime.getTime();
      const existingSlotCount = Math.round(existingDurationMs / (GRID_GRANULARITY_MINUTES * 60 * 1000));
      const newSlotCount = body.slotCount ?? existingSlotCount;
      const newCourtIds = body.courtIds ?? existingCourtIds;
      courtsInput = newCourtIds.map((cid) => ({
        courtId: cid,
        startTime: newStartTime.toISOString(),
        slotCount: newSlotCount,
      }));
    }

    const newCourtIds = courtsInput.map((c) => c.courtId);

    const validation = validateMultiCourtBooking(courtsInput, config, "staff");
    if (!validation.valid) return error(validation.error!, 400);

    // Verify courts belong to the venue and are bookable
    const courtRecords = await prisma.court.findMany({
      where: { id: { in: newCourtIds }, venueId: group.venueId, isBookable: true },
      select: { id: true, pricingGroupId: true, priceOverride: true },
    });
    if (courtRecords.length !== newCourtIds.length) {
      return error("One or more courts not found or not bookable", 404);
    }

    // Build per-court matrix map
    const pricingGroups = await prisma.pricingGroup.findMany({
      where: { venueId: group.venueId },
      select: { id: true, name: true, isDefault: true, defaultPriceValue: true, pricingRules: true },
    });
    const courtMatrices = new Map<string, PricingMatrix>();
    for (const cr of courtRecords) {
      const { matrix } = resolveCourtPricingMatrix(cr, pricingGroups, {
        defaultPriceValue: config.defaultPriceValue,
        pricingRules: config.pricingRules,
      });
      courtMatrices.set(cr.id, matrix);
    }

    const pricing = resolveGroupBookingPrice(config, courtsInput, venueTimezone, courtMatrices);

    // Per-court time windows (each court may differ)
    const courtTimes = courtsInput.map((c) => ({
      courtId: c.courtId,
      start: new Date(c.startTime),
      end: new Date(new Date(c.startTime).getTime() + c.slotCount * GRID_GRANULARITY_MINUTES * 60 * 1000),
    }));
    // Group start/end spans earliest→latest across all courts
    const groupStart = courtTimes.reduce((e, t) => t.start < e ? t.start : e, courtTimes[0].start);
    const groupEnd = courtTimes.reduce((l, t) => t.end > l ? t.end : l, courtTimes[0].end);

    const result = await prisma.$transaction(async (tx) => {
      // Conflict-check each court using its own time window
      for (const ct of courtTimes) {
        const conflict = await tx.booking.findFirst({
          where: {
            courtId: ct.courtId,
            date: dateForWrite,
            status: { in: ["confirmed", "completed"] },
            startTime: { lt: ct.end },
            endTime: { gt: ct.start },
            bookingGroupId: { not: groupId },
          },
        });
        if (conflict) throw new Error(`CONFLICT:${ct.courtId}`);
      }

      // Delete bookings for courts removed from the group
      const removedCourtIds = existingCourtIds.filter((cid) => !newCourtIds.includes(cid));
      if (removedCourtIds.length > 0) {
        await tx.booking.deleteMany({
          where: { bookingGroupId: groupId, courtId: { in: removedCourtIds } },
        });
      }

      // Upsert bookings for each court using its own time window
      const bookingRows = await Promise.all(
        courtTimes.map(async (ct) => {
          const courtPrice = pricing.perCourt.find((p) => p.courtId === ct.courtId)?.priceValue ?? 0;
          const existing = group.bookings.find((b) => b.courtId === ct.courtId);
          if (existing) {
            return tx.booking.update({
              where: { id: existing.id },
              data: {
                date: dateForWrite,
                startTime: ct.start,
                endTime: ct.end,
                priceValue: courtPrice,
                playerId: newPlayerId,
              },
              include: { court: { select: { id: true, label: true } } },
            });
          }
          return tx.booking.create({
            data: {
              courtId: ct.courtId,
              venueId: group.venueId,
              playerId: newPlayerId,
              date: dateForWrite,
              startTime: ct.start,
              endTime: ct.end,
              status: "confirmed",
              priceValue: courtPrice,
              coPlayerIds: [],
              paymentStatus: group.paymentStatus,
              bookingGroupId: groupId,
            },
            include: { court: { select: { id: true, label: true } } },
          });
        })
      );

      const updatedGroup = await tx.bookingGroup.update({
        where: { id: groupId },
        data: {
          date: dateForWrite,
          startTime: groupStart,
          endTime: groupEnd,
          totalPriceValue: pricing.total,
          playerId: newPlayerId,
        },
      });

      return { group: updatedGroup, bookings: bookingRows };
    });

    return json(result);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith("CONFLICT:")) {
      return error("Slot no longer available — pick another.", 409);
    }
    return error(msg, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { groupId } = await params;

    const group = await prisma.bookingGroup.findUnique({
      where: { id: groupId },
      include: { bookings: true },
    });
    if (!group) return notFound("Group booking not found");
    if (group.status === "cancelled") return error("Already cancelled", 400);

    // Paid group bookings must be cancelled via PATCH action=cancel with a reason
    const wasPaid = group.paymentStatus === "paid" || group.paymentStatus === "PAID";
    if (wasPaid) {
      return error("Use PATCH with action=cancel and cancellationReason to cancel a paid group booking", 400);
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.booking.updateMany({
        where: { bookingGroupId: groupId },
        data: { status: "cancelled", cancelledAt: now },
      }),
      prisma.bookingGroup.update({
        where: { id: groupId },
        data: { status: "cancelled", cancelledAt: now },
      }),
    ]);

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
