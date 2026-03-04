import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const auth = requireStaff(request.headers);
    const { sessionId } = await params;

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return error("Session not found", 404);
    if (session.status === "closed") return error("Session already closed", 400);

    const updated = await prisma.session.update({
      where: { id: sessionId },
      data: { status: "closed", closedAt: new Date() },
    });

    await prisma.queueEntry.updateMany({
      where: { sessionId, status: { in: ["waiting", "on_break"] } },
      data: { status: "left" },
    });

    await prisma.court.updateMany({
      where: { venueId: session.venueId },
      data: { activeInSession: false },
    });

    await prisma.auditLog.create({
      data: {
        venueId: session.venueId,
        staffId: auth.id,
        action: "session_closed",
        targetId: sessionId,
      },
    });

    emitToVenue(session.venueId, "session:updated", { session: updated, courts: [] });
    emitToVenue(session.venueId, "player:notification", {
      type: "session_closing",
      message: "Today's session is ending — thanks for playing!",
    });

    return json(updated);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
