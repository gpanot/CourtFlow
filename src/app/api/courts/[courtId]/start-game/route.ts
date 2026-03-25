import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, errorJson } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";
import { runRotation } from "@/lib/algorithm";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ courtId: string }> }
) {
  try {
    requireStaff(request.headers);
    const { courtId } = await params;

    const court = await prisma.court.findUnique({ where: { id: courtId } });
    if (!court) return error("Court not found", 404);
    if (court.status !== "idle") return error("Court is not idle", 400);
    if (!court.activeInSession) return error("Court is not in the active session", 400);

    const session = await prisma.session.findFirst({
      where: { venueId: court.venueId, status: "open" },
    });
    if (!session) return error("No active session", 400);

    const rotation = await runRotation(court.venueId, session.id, courtId);

    if (!rotation.ok) {
      if (rotation.reason === "insufficient_waiting") {
        return errorJson(
          {
            error: `Need 4 players with status “waiting” in the queue to start automatically. Currently ${rotation.waitingCount} waiting.`,
            code: "INSUFFICIENT_WAITING",
            waitingCount: rotation.waitingCount,
          },
          400
        );
      }
      if (rotation.reason === "no_valid_foursome") {
        return errorJson(
          {
            error:
              "There are enough players in line, but no foursome matches rotation rules: use 4 men, 4 women, or 2 men + 2 women (3–1 splits are not used for auto-start). You can fill this court from the queue anyway (warmup) if you choose.",
            code: "NO_VALID_FOURSOME",
            waitingCount: rotation.waitingCount,
            suggestAutofill: rotation.waitingCount >= 4,
          },
          400
        );
      }
      return error("This court is not ready to start a game (must be idle and in session).", 400);
    }

    const allCourts = await prisma.court.findMany({
      where: { venueId: court.venueId, activeInSession: true },
      include: { courtAssignments: { where: { endedAt: null }, take: 1 } },
    });

    const queueEntries = await prisma.queueEntry.findMany({
      where: { sessionId: session.id, status: { in: ["waiting", "on_break"] } },
      include: { player: true, group: true },
      orderBy: { joinedAt: "asc" },
    });

    emitToVenue(court.venueId, "court:updated", allCourts);
    emitToVenue(court.venueId, "queue:updated", queueEntries);

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
