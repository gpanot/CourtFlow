import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue, emitToPlayer } from "@/lib/socket-server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ courtId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { courtId } = await params;
    const body = await parseBody<Record<string, unknown>>(request);

    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court) return notFound("Court not found");

    const isDeactivating =
      body.activeInSession === false ||
      body.status === "maintenance";

    let requeuedPlayerIds: string[] = [];

    if (isDeactivating) {
      const activeAssignment = await prisma.courtAssignment.findFirst({
        where: { courtId, endedAt: null },
      });

      if (activeAssignment) {
        const now = new Date();
        const gameDuration = Math.floor(
          (now.getTime() - activeAssignment.startedAt.getTime()) / 60000
        );

        await prisma.courtAssignment.update({
          where: { id: activeAssignment.id },
          data: { endedAt: now, endedBy: auth.id },
        });

        for (const playerId of activeAssignment.playerIds) {
          await prisma.queueEntry.updateMany({
            where: {
              playerId,
              sessionId: activeAssignment.sessionId,
              status: { in: ["playing", "assigned"] },
            },
            data: { status: "waiting", joinedAt: now, totalPlayMinutesToday: { increment: gameDuration } },
          });
        }

        requeuedPlayerIds = activeAssignment.playerIds;

        const waitingEntries = await prisma.queueEntry.findMany({
          where: { sessionId: activeAssignment.sessionId, status: "waiting" },
          orderBy: { joinedAt: "asc" },
          select: { playerId: true },
        });

        for (const playerId of requeuedPlayerIds) {
          const position = waitingEntries.findIndex((e) => e.playerId === playerId) + 1;
          emitToPlayer(playerId, "player:notification", {
            type: "requeued",
            message: `Court ${court.label} was removed. You're #${position} in line.`,
            courtLabel: court.label,
            position,
          });
        }

        await prisma.auditLog.create({
          data: {
            venueId: court.venueId,
            staffId: auth.id,
            action: "game_ended",
            targetId: courtId,
            metadata: { playerIds: requeuedPlayerIds, gameDuration, reason: "court_removed" },
          },
        });
      }
    }

    const updated = await prisma.court.update({
      where: { id: courtId },
      data: body,
    });

    const session = await prisma.session.findFirst({
      where: { venueId: court.venueId, status: "open" },
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

    if (requeuedPlayerIds.length > 0 && session) {
      const queueEntries = await prisma.queueEntry.findMany({
        where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
        include: { player: true, group: true },
        orderBy: { joinedAt: "asc" },
      });
      emitToVenue(court.venueId, "queue:updated", queueEntries);
    }

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
