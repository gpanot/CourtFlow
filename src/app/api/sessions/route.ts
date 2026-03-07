import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";
import { emitToVenue } from "@/lib/socket-server";

export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get("venueId");
  if (!venueId) return error("venueId is required");

  try {
    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
      orderBy: { openedAt: "desc" },
    });
    return json(session);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const { venueId, courtIds } = await parseBody<{ venueId: string; courtIds: string[] }>(request);

    const existing = await prisma.session.findFirst({
      where: { venueId, status: "open" },
    });
    if (existing) return error("A session is already open at this venue", 409);

    // Safety net: clean up any stale active queue entries from previously closed sessions
    const closedSessionIds = await prisma.session.findMany({
      where: { venueId, status: "closed" },
      select: { id: true },
    });
    if (closedSessionIds.length > 0) {
      await prisma.queueEntry.updateMany({
        where: {
          sessionId: { in: closedSessionIds.map((s) => s.id) },
          status: { in: ["waiting", "assigned", "playing", "on_break"] },
        },
        data: { status: "left" },
      });
    }

    const session = await prisma.session.create({
      data: { venueId },
    });

    if (courtIds?.length) {
      await prisma.court.updateMany({
        where: { id: { in: courtIds }, venueId },
        data: { activeInSession: true, status: "idle" },
      });
    }

    await prisma.auditLog.create({
      data: {
        venueId,
        staffId: auth.id,
        action: "session_opened",
        targetId: session.id,
      },
    });

    const courts = await prisma.court.findMany({
      where: { venueId, activeInSession: true },
    });

    emitToVenue(venueId, "session:updated", { session, courts });
    return json({ session, courts }, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
