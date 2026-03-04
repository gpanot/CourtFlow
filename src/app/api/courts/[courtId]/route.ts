import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courtId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { courtId } = await params;
    const body = await parseBody<Record<string, unknown>>(request);

    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court) return notFound("Court not found");

    const updated = await prisma.court.update({
      where: { id: courtId },
      data: body,
    });

    const allCourts = await prisma.court.findMany({
      where: { venueId: court.venueId, activeInSession: true },
      include: {
        courtAssignments: {
          where: { endedAt: null },
          take: 1,
        },
      },
    });

    emitToVenue(court.venueId, "court:updated", allCourts);
    return json(updated);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ courtId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { courtId } = await params;

    const court = await prisma.court.findUnique({
      where: { id: courtId },
      include: {
        courtAssignments: { where: { endedAt: null }, take: 1 },
      },
    });
    if (!court) return notFound("Court not found");

    if (court.courtAssignments.length > 0) {
      return error("Cannot delete a court with an active game. End the game first.", 409);
    }

    await prisma.courtAssignment.deleteMany({ where: { courtId } });
    await prisma.court.delete({ where: { id: courtId } });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
