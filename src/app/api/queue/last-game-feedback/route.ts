import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

const VALID_RATINGS = ["fire", "thumbs_up", "neutral", "frustrated"] as const;
type Rating = (typeof VALID_RATINGS)[number];

export async function POST(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const body = await parseBody<{ sessionId: string; venueId: string; rating: string }>(request);

    if (!body.sessionId || !body.venueId) {
      return error("sessionId and venueId are required", 400);
    }
    if (!VALID_RATINGS.includes(body.rating as Rating)) {
      return error("Invalid rating", 400);
    }

    const entry = await prisma.queueEntry.findFirst({
      where: {
        sessionId: body.sessionId,
        playerId: auth.id,
        status: "waiting",
      },
      include: { session: true },
    });

    if (!entry) {
      return error("Not in queue for this session", 403);
    }

    if (entry.session.venueId !== body.venueId) {
      return error("Venue mismatch", 400);
    }

    await prisma.auditLog.create({
      data: {
        venueId: entry.session.venueId,
        action: "queue_last_game_feedback",
        targetId: auth.id,
        metadata: {
          sessionId: body.sessionId,
          queueEntryId: entry.id,
          rating: body.rating,
        },
      },
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
