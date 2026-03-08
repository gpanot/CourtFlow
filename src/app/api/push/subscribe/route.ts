import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

interface SubscribeBody {
  playerId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function POST(request: NextRequest) {
  try {
    const authPayload = requireAuth(request.headers);
    const body = await parseBody<SubscribeBody>(request);

    if (authPayload.role === "player" && authPayload.id !== body.playerId) {
      return error("Cannot subscribe for another player", 403);
    }

    if (!body.endpoint || !body.p256dh || !body.auth) {
      return error("Missing subscription fields");
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { playerId: body.playerId, p256dh: body.p256dh, auth: body.auth },
      create: {
        playerId: body.playerId,
        endpoint: body.endpoint,
        p256dh: body.p256dh,
        auth: body.auth,
      },
    });

    return json({ ok: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
