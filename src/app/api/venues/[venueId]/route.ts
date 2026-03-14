import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { Prisma } from "@prisma/client";

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
    const auth = requireSuperAdmin(request.headers);
    const { venueId } = await params;

    const owned = await prisma.venue.count({
      where: { id: venueId, staff: { some: { id: auth.id } } },
    });
    if (!owned) return error("You don't own this venue", 403);

    const body = await parseBody<Record<string, unknown>>(request);
    const venue = await prisma.venue.update({
      where: { id: venueId },
      data: body,
    });

    if ("tvText" in body || "logoUrl" in body || "name" in body) {
      emitToVenue(venueId, "venue:updated", { id: venueId, logoUrl: venue.logoUrl, tvText: venue.tvText, name: venue.name });
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
    const auth = requireSuperAdmin(request.headers);
    const { venueId } = await params;

    const owned = await prisma.venue.count({
      where: { id: venueId, staff: { some: { id: auth.id } } },
    });
    if (!owned) return error("You don't own this venue", 403);

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
      }

      await tx.court.deleteMany({ where: { venueId } });
      await tx.session.deleteMany({ where: { venueId } });
      await tx.auditLog.deleteMany({ where: { venueId } });
      await tx.venue.update({
        where: { id: venueId },
        data: { staff: { set: [] } },
      });
      await tx.venue.delete({ where: { id: venueId } });
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
