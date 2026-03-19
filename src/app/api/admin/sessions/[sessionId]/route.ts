import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = requireSuperAdmin(request.headers);
    const { sessionId } = await params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        venue: { select: { id: true, name: true } },
        _count: { select: { queueEntries: true, courtAssignments: true, playerGroups: true } },
      },
    });

    if (!session) return error("Session not found", 404);
    if (session.status === "open") {
      return error("Cannot delete an open session. Close it first.", 400);
    }

    let reason: string | undefined;
    try {
      const body = await request.json();
      reason = body?.reason;
    } catch {
      // No body is fine
    }

    // Log before deletion so the audit record persists
    await prisma.auditLog.create({
      data: {
        venueId: session.venue.id,
        staffId: auth.id,
        action: "SESSION_DELETED",
        targetId: sessionId,
        reason: reason || undefined,
        metadata: {
          venueName: session.venue.name,
          openedAt: session.openedAt.toISOString(),
          closedAt: session.closedAt?.toISOString() ?? null,
          deletedStaffId: session.staffId,
          queueEntries: session._count.queueEntries,
          courtAssignments: session._count.courtAssignments,
          playerGroups: session._count.playerGroups,
        },
      },
    });

    // Cascade delete child records, then the session
    await prisma.queueEntry.deleteMany({ where: { sessionId } });
    await prisma.courtAssignment.deleteMany({ where: { sessionId } });
    await prisma.playerGroup.deleteMany({ where: { sessionId } });
    await prisma.session.delete({ where: { id: sessionId } });

    return json({
      deleted: true,
      sessionId,
      venueName: session.venue.name,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("admin")) return error(msg, 403);
    return error(msg, 500);
  }
}
