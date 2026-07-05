import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import {
  getBookingConfig,
  resolveGroupBookingPrice,
  validateMultiCourtBooking,
  GRID_GRANULARITY_MINUTES,
  type MultiCourtEntry,
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
      date?: string;
      startTime?: string;
      slotCount?: number;
      courtIds?: string[];
      playerId?: string;
    }>(request);

    const group = await prisma.bookingGroup.findUnique({
      where: { id: groupId },
      include: { bookings: true },
    });
    if (!group) return notFound("Group booking not found");
    if (group.status === "cancelled") return error("Cannot edit a cancelled group booking", 400);

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
    const dateForWrite = new Date(dateKey + "T12:00:00+07:00");
    const dateForQuery = new Date(dateKey);

    const newStartTime = body.startTime ? new Date(body.startTime) : group.startTime;
    const existingDurationMs = group.endTime.getTime() - group.startTime.getTime();
    const existingSlotCount = Math.round(existingDurationMs / (GRID_GRANULARITY_MINUTES * 60 * 1000));
    const newSlotCount = body.slotCount ?? existingSlotCount;
    const newDurationMs = newSlotCount * GRID_GRANULARITY_MINUTES * 60 * 1000;
    const newEndTime = new Date(newStartTime.getTime() + newDurationMs);

    const newPlayerId = body.playerId ?? group.playerId;

    // Determine the new court set
    const existingCourtIds = group.bookings.map((b) => b.courtId);
    const newCourtIds = body.courtIds ?? existingCourtIds;

    const courtsInput: MultiCourtEntry[] = newCourtIds.map((cid) => ({
      courtId: cid,
      startTime: newStartTime.toISOString(),
      slotCount: newSlotCount,
    }));

    const validation = validateMultiCourtBooking(courtsInput, config, "staff");
    if (!validation.valid) return error(validation.error!, 400);

    // Verify courts belong to the venue and are bookable
    const courtRecords = await prisma.court.findMany({
      where: { id: { in: newCourtIds }, venueId: group.venueId, isBookable: true },
    });
    if (courtRecords.length !== newCourtIds.length) {
      return error("One or more courts not found or not bookable", 404);
    }

    const pricing = resolveGroupBookingPrice(config, courtsInput, venueTimezone);
    const durationMinutes = newSlotCount * GRID_GRANULARITY_MINUTES;

    const result = await prisma.$transaction(async (tx) => {
      // Conflict-check each new court, excluding existing bookings in this group
      for (const cid of newCourtIds) {
        const conflict = await tx.booking.findFirst({
          where: {
            courtId: cid,
            date: dateForQuery,
            status: { in: ["confirmed", "completed"] },
            startTime: { lt: newEndTime },
            endTime: { gt: newStartTime },
            bookingGroupId: { not: groupId },
          },
        });
        if (conflict) throw new Error(`CONFLICT:${cid}`);
      }

      // Delete bookings for courts removed from the group
      const removedCourtIds = existingCourtIds.filter((cid) => !newCourtIds.includes(cid));
      if (removedCourtIds.length > 0) {
        await tx.booking.deleteMany({
          where: { bookingGroupId: groupId, courtId: { in: removedCourtIds } },
        });
      }

      // Upsert bookings for each new court
      const bookingRows = await Promise.all(
        newCourtIds.map(async (cid) => {
          const courtPrice = pricing.perCourt.find((p) => p.courtId === cid)?.priceValue ?? 0;
          const existing = group.bookings.find((b) => b.courtId === cid);
          if (existing) {
            return tx.booking.update({
              where: { id: existing.id },
              data: {
                date: dateForWrite,
                startTime: newStartTime,
                endTime: newEndTime,
                priceValue: courtPrice,
                playerId: newPlayerId,
              },
              include: { court: { select: { id: true, label: true } } },
            });
          }
          return tx.booking.create({
            data: {
              courtId: cid,
              venueId: group.venueId,
              playerId: newPlayerId,
              date: dateForWrite,
              startTime: newStartTime,
              endTime: new Date(newStartTime.getTime() + durationMinutes * 60 * 1000),
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
          startTime: newStartTime,
          endTime: newEndTime,
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
