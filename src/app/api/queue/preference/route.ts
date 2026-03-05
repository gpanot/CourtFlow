import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

export async function PATCH(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const { gamePreference } = await parseBody<{ gamePreference: string }>(request);

    const valid = ["no_preference", "same_gender"];
    if (!gamePreference || !valid.includes(gamePreference)) {
      return error("gamePreference must be 'no_preference' or 'same_gender'");
    }

    const entry = await prisma.queueEntry.findFirst({
      where: {
        playerId: auth.id,
        status: { in: ["waiting", "on_break"] },
      },
    });

    if (!entry) return error("No active queue entry found");

    const updated = await prisma.queueEntry.update({
      where: { id: entry.id },
      data: { gamePreference: gamePreference as "no_preference" | "same_gender" },
    });

    return json(updated);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
