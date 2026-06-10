import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin, requireManagerOrSuperAdmin } from "@/lib/auth";
import { parseBody } from "@/lib/api-helpers";
import { assertVenueAccess } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/sessions
 * Body: { venueId, openedAt, closedAt, title?, sessionFee?, staffId? }
 *
 * Manually creates a closed (backdated) session.
 * Manager or superadmin only — caller must have access to the venue.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(req.headers);
    const body = await parseBody<{
      venueId: string;
      openedAt: string;
      closedAt: string;
      title?: string;
      sessionFee?: number;
      staffId?: string;
    }>(req);

    const { venueId, openedAt, closedAt, title, sessionFee, staffId } = body;

    if (!venueId || !openedAt || !closedAt) {
      return NextResponse.json(
        { error: "venueId, openedAt and closedAt are required" },
        { status: 400 }
      );
    }

    await assertVenueAccess(auth, venueId);

    const openDate = new Date(openedAt);
    const closeDate = new Date(closedAt);

    if (isNaN(openDate.getTime()) || isNaN(closeDate.getTime())) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    if (closeDate <= openDate) {
      return NextResponse.json(
        { error: "closedAt must be after openedAt" },
        { status: 400 }
      );
    }

    const session = await prisma.session.create({
      data: {
        venueId,
        staffId: staffId ?? null,
        date: openDate,
        openedAt: openDate,
        closedAt: closeDate,
        status: "closed",
        type: "open_play",
        title: title ?? null,
        sessionFee: sessionFee ?? 0,
      },
      include: {
        staff: { select: { name: true } },
        venue: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("Access denied") ? 403 :
      message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * DELETE /api/admin/sessions
 * Body: { sessionIds: string[] }
 *
 * Permanently deletes sessions and all their associated data.
 * Superadmin only — used to clean up test/dummy sessions.
 */
export async function DELETE(req: NextRequest) {
  try {
    requireSuperAdmin(req.headers);

    const body = await parseBody<{ sessionIds: string[] }>(req);
    const { sessionIds } = body;

    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return NextResponse.json(
        { error: "sessionIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (sessionIds.length > 50) {
      return NextResponse.json(
        { error: "Cannot delete more than 50 sessions at once" },
        { status: 400 }
      );
    }

    // Verify all sessions exist
    const found = await prisma.session.findMany({
      where: { id: { in: sessionIds } },
      select: { id: true, venueId: true },
    });

    if (found.length === 0) {
      return NextResponse.json({ error: "No sessions found" }, { status: 404 });
    }

    const foundIds = found.map((s) => s.id);

    // Delete all related data in dependency order
    await prisma.$transaction(async (tx) => {
      // Payments linked to these sessions (nullify sessionId or delete)
      await tx.pendingPayment.deleteMany({
        where: { sessionId: { in: foundIds } },
      });

      // Queue entries
      await tx.queueEntry.deleteMany({
        where: { sessionId: { in: foundIds } },
      });

      // Court assignments (cascade from court+session, but not always set)
      await tx.courtAssignment.deleteMany({
        where: { sessionId: { in: foundIds } },
      });

      // Player groups
      await tx.playerGroup.deleteMany({
        where: { sessionId: { in: foundIds } },
      });

      // Player rankings
      await tx.playerRanking.deleteMany({
        where: { sessionId: { in: foundIds } },
      });

      // Audit logs referencing these sessions
      await tx.auditLog.deleteMany({
        where: { targetId: { in: foundIds } },
      });

      // Finally delete the sessions themselves
      await tx.session.deleteMany({
        where: { id: { in: foundIds } },
      });
    });

    return NextResponse.json({
      deleted: foundIds.length,
      sessionIds: foundIds,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status =
      message.includes("access") || message.includes("token")
        ? 401
        : message.includes("superadmin")
          ? 403
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
