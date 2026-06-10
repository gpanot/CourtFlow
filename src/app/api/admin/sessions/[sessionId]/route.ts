import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { assertVenueAccess } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/sessions/[sessionId]
 * Body: { openedAt?, closedAt?, title?, sessionFee?, staffId? }
 *
 * Edits a manually-created or existing closed session.
 * Manager or superadmin only — caller must have access to the venue.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const { sessionId } = await params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, venueId: true, status: true },
    });
    if (!session) return error("Session not found", 404);

    await assertVenueAccess(auth, session.venueId);

    const body = await parseBody<{
      openedAt?: string;
      closedAt?: string;
      title?: string;
      sessionFee?: number;
      staffId?: string | null;
    }>(request);

    const updateData: Record<string, unknown> = {};

    if (body.openedAt !== undefined) {
      const d = new Date(body.openedAt);
      if (isNaN(d.getTime())) return error("Invalid openedAt", 400);
      updateData.openedAt = d;
      updateData.date = d;
    }
    if (body.closedAt !== undefined) {
      const d = new Date(body.closedAt);
      if (isNaN(d.getTime())) return error("Invalid closedAt", 400);
      updateData.closedAt = d;
    }
    if (body.title !== undefined) updateData.title = body.title || null;
    if (body.sessionFee !== undefined) updateData.sessionFee = body.sessionFee;
    if ("staffId" in body) updateData.staffId = body.staffId ?? null;

    if (updateData.openedAt && updateData.closedAt) {
      if ((updateData.closedAt as Date) <= (updateData.openedAt as Date)) {
        return error("closedAt must be after openedAt", 400);
      }
    }

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: updateData,
      include: { staff: { select: { name: true } } },
    });

    return json({ session: updated });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("Access denied")) return error(msg, 403);
    if (msg.includes("admin") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
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
