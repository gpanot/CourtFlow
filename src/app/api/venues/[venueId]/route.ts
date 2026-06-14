import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin, requireSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";
import { emitToVenue } from "@/lib/socket-server";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const { venueId } = await params;
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { courts: true },
    });
    if (!venue) return notFound("Venue not found");
    return json(venue);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { venueId } = await params;
    await assertVenueAccess(auth, venueId);

    const body = await parseBody<Record<string, unknown>>(request);

    // Only superadmins can reassign venue ownership
    if ("ownerId" in body && auth.role !== "superadmin") {
      return error("Only superadmins can reassign venue ownership", 403);
    }

    const venue = await prisma.venue.update({
      where: { id: venueId },
      data: body,
    });

    if ("tvText" in body || "logoUrl" in body || "name" in body || "settings" in body) {
      emitToVenue(venueId, "venue:updated", { id: venueId, logoUrl: venue.logoUrl, tvText: venue.tvText, name: venue.name, settings: venue.settings });
    }

    return json(venue);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { venueId } = await params;

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { sessions: { where: { status: "open" }, take: 1 } },
    });
    if (!venue) return notFound("Venue not found");

    if (venue.sessions.length > 0) {
      return error("Cannot delete a venue with an active session. Close the session first.", 409);
    }

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const sessions = await tx.session.findMany({
        where: { venueId },
        select: { id: true },
      });
      const sessionIds = sessions.map((s) => s.id);

      if (sessionIds.length > 0) {
        await tx.queueEntry.deleteMany({ where: { sessionId: { in: sessionIds } } });
        await tx.playerGroup.deleteMany({ where: { sessionId: { in: sessionIds } } });
      }

      const courts = await tx.court.findMany({
        where: { venueId },
        select: { id: true },
      });
      const courtIds = courts.map((c) => c.id);

      if (courtIds.length > 0) {
        await tx.courtAssignment.deleteMany({ where: { courtId: { in: courtIds } } });
        await tx.courtBlock.deleteMany({ where: { courtId: { in: courtIds } } });
        await tx.booking.deleteMany({ where: { courtId: { in: courtIds } } });
      }

      // Delete all venue-scoped data
      await tx.openPlayRegistration.deleteMany({ where: { venueId } });
      await tx.coachLesson.deleteMany({ where: { venueId } });
      await tx.coachPackage.deleteMany({ where: { venueId } });
      await tx.membershipTier.deleteMany({ where: { venueId } });
      await tx.membership.deleteMany({ where: { venueId } });
      await tx.billingInvoice.deleteMany({ where: { venueId } });
      await tx.venueBillingRate.deleteMany({ where: { venueId } });
      await tx.checkInRecord.deleteMany({ where: { venueId } });
      await tx.checkInPlayer.deleteMany({ where: { venueId } });
      await tx.court.deleteMany({ where: { venueId } });
      await tx.session.deleteMany({ where: { venueId } });
      await tx.auditLog.deleteMany({ where: { venueId } });
      await tx.staffVenueAssignment.deleteMany({ where: { venueId } });
      await tx.venue.delete({ where: { id: venueId } });
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
