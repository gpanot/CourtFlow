import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);

    await prisma.player.update({
      where: { id: playerId },
      data: { playerIdentityId: null },
    });

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
