import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { signToken } from "@/lib/auth";
import { setPlayerAuthCookieOnResponse } from "@/lib/player-auth-cookie";
import { logPlayerAppAuth } from "@/lib/player-app-auth-log";

type WristbandBody = {
  queueNumber?: number;
  venueId?: string;
  /** When true, response includes `_debug` and server logs extra detail (use `?debug=1` on player URL). */
  debug?: boolean;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as WristbandBody;
    const { queueNumber, venueId, debug: wantDebug } = body;

    if (!queueNumber || typeof queueNumber !== "number") {
      return error("queueNumber is required", 400);
    }

    const activeSession = await prisma.session.findFirst({
      where: {
        status: "open",
        ...(venueId ? { venueId } : {}),
      },
      orderBy: { openedAt: "desc" },
    });

    console.log("[player/wristband-login]", {
      queueNumber,
      venueIdFilter: venueId ?? "(any open session)",
      sessionFound: !!activeSession,
      sessionId: activeSession?.id ?? null,
      sessionVenueId: activeSession?.venueId ?? null,
    });

    if (!activeSession) {
      const payload = { success: false as const, error: "No active session right now" };
      if (wantDebug) {
        return json({
          ...payload,
          _debug: {
            queueNumber,
            venueIdRequested: venueId ?? null,
            reason: "no_open_session_for_filter",
          },
        });
      }
      return json(payload);
    }

    const queueEntry = await prisma.queueEntry.findFirst({
      where: {
        sessionId: activeSession.id,
        queueNumber,
        status: { in: ["waiting", "assigned", "playing", "on_break"] },
      },
      include: { player: { select: { id: true, name: true } } },
    });

    let entryAnyStatus = null as { status: string; queueNumber: number | null } | null;
    if (!queueEntry && wantDebug) {
      entryAnyStatus = await prisma.queueEntry.findFirst({
        where: { sessionId: activeSession.id, queueNumber },
        select: { status: true, queueNumber: true },
      });
    }

    if (!queueEntry) {
      const sampleNumbers = await prisma.queueEntry.findMany({
        where: { sessionId: activeSession.id, queueNumber: { not: null } },
        select: { queueNumber: true, status: true },
        take: 40,
        orderBy: { queueNumber: "asc" },
      });
      console.log("[player/wristband-login] no matching entry", {
        queueNumber,
        sessionId: activeSession.id,
        entryWithNumberOtherStatus: entryAnyStatus,
        sampleQueueRows: sampleNumbers,
      });

      const payload = {
        success: false as const,
        error: "Number not found in today's session",
      };
      if (wantDebug) {
        return json({
          ...payload,
          _debug: {
            queueNumber,
            venueIdRequested: venueId ?? null,
            sessionId: activeSession.id,
            sessionVenueId: activeSession.venueId,
            reason: entryAnyStatus ? "queue_row_exists_wrong_status" : "no_queue_row_for_number",
            entryAnyStatus,
            sampleQueueRows: sampleNumbers,
          },
        });
      }
      return json(payload);
    }

    void logPlayerAppAuth(queueEntry.player.id, "wristband", activeSession.id);

    const token = signToken({ id: queueEntry.player.id, role: "player" });
    console.log("[player/wristband-login] ok", {
      playerId: queueEntry.player.id,
      queueNumber: queueEntry.queueNumber,
      sessionId: activeSession.id,
    });

    const res = json({
      success: true,
      playerId: queueEntry.player.id,
      playerName: queueEntry.player.name,
      queueNumber: queueEntry.queueNumber,
      sessionToken: token,
      ...(wantDebug && {
        _debug: {
          sessionId: activeSession.id,
          sessionVenueId: activeSession.venueId,
          tokenLength: token.length,
        },
      }),
    });
    setPlayerAuthCookieOnResponse(res, token);
    return res;
  } catch (e) {
    console.error("[player/wristband-login] Error:", e);
    return error((e as Error).message, 500);
  }
}
