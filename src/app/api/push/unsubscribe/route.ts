import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    requireAuth(request.headers);
    const body = await parseBody<{ endpoint: string }>(request);

    if (!body.endpoint) {
      return error("Missing endpoint");
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint },
    });

    return json({ ok: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
