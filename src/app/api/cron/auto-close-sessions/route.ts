import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { emitToVenue } from "@/lib/socket-server";

export const dynamic = "force-dynamic";

/**
 * Auto-close sessions that have been open for more than 6 hours.
 * Called by a Railway cron job every hour.
 * Auth: Bearer CRON_SECRET header (required when CRON_SECRET env var is set).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - SIX_HOURS_MS);

  try {
    // Find all sessions that are still open and were opened more than 6 hours ago
    const staleSessions = await prisma.session.findMany({
      where: {
        status: "open",
        openedAt: { lte: cutoff },
      },
      select: { id: true, venueId: true, openedAt: true },
    });

    if (staleSessions.length === 0) {
      return NextResponse.json({ closed: 0, sessions: [] });
    }

    const now = new Date();
    const closedIds: string[] = [];

    for (const session of staleSessions) {
      try {
        // Close the session
        const updated = await prisma.session.update({
          where: { id: session.id },
          data: { status: "closed", closedAt: now },
        });

        // Move active queue entries to "left"
        await prisma.queueEntry.updateMany({
          where: {
            sessionId: session.id,
            status: { in: ["waiting", "assigned", "playing", "on_break"] },
          },
          data: { status: "left" },
        });

        // End any open court assignments
        await prisma.courtAssignment.updateMany({
          where: { sessionId: session.id, endedAt: null },
          data: { endedAt: now },
        });

        // Reset courts to idle
        await prisma.court.updateMany({
          where: { venueId: session.venueId },
          data: {
            activeInSession: false,
            status: "idle",
            skipWarmupAfterMaintenance: false,
          },
        });

        // Audit log (no staffId — system action)
        await prisma.auditLog.create({
          data: {
            venueId: session.venueId,
            action: "session_auto_closed",
            targetId: session.id,
          },
        });

        // Notify connected clients
        emitToVenue(session.venueId, "session:updated", {
          session: updated,
          courts: [],
        });

        closedIds.push(session.id);
        console.log(
          `[auto-close-sessions] Closed session ${session.id} (venue ${session.venueId}, opened ${session.openedAt.toISOString()})`
        );
      } catch (err) {
        console.error(
          `[auto-close-sessions] Failed to close session ${session.id}:`,
          err
        );
      }
    }

    return NextResponse.json({
      closed: closedIds.length,
      sessions: closedIds,
    });
  } catch (err) {
    console.error("[auto-close-sessions] Cron error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
