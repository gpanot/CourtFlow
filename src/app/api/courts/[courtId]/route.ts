import { NextRequest } from "next/server";
import type { CourtStatus } from "@prisma/client";
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

    let clearedCourtPlayerIds: string[] = [];

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

        // Same as end-game: on_break = checked in, not in queue — must scan TV tablet to join again
        for (const playerId of activeAssignment.playerIds) {
          await prisma.queueEntry.updateMany({
            where: {
              playerId,
              sessionId: activeAssignment.sessionId,
              status: { in: ["playing", "assigned"] },
            },
            data: {
              status: "on_break",
              totalPlayMinutesToday: { increment: gameDuration },
            },
          });
        }

        clearedCourtPlayerIds = activeAssignment.playerIds;

        const clearedMessage =
          "The court was cleared. Scan at the TV when you're ready to join the queue again.";

        for (const playerId of clearedCourtPlayerIds) {
          emitToPlayer(playerId, "player:notification", {
            type: "game_ended",
            message: clearedMessage,
            courtLabel: court.label,
          });
        }

        await prisma.auditLog.create({
          data: {
            venueId: court.venueId,
            staffId: auth.id,
            action: "game_ended",
            targetId: courtId,
            metadata: {
              playerIds: clearedCourtPlayerIds,
              gameDuration,
              reason: "court_cleared_to_checked_in",
            },
          },
        });
      }
    }

    const nextStatus = body.status as CourtStatus | undefined;
    const updateData: Record<string, unknown> = { ...body };
    if (nextStatus === "maintenance") {
      updateData.skipWarmupAfterMaintenance = false;
    } else if (
      court.status === "maintenance" &&
      (nextStatus === "idle" || nextStatus === "active")
    ) {
      updateData.skipWarmupAfterMaintenance = true;
    }

    const updated = await prisma.court.update({
      where: { id: courtId },
      data: updateData,
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

    if (clearedCourtPlayerIds.length > 0 && session) {
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
