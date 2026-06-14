import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/** GET /api/public/open-play/my — All registrations for the logged-in player */
export async function GET(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);

    const registrations = await prisma.openPlayRegistration.findMany({
      where: { playerId },
      orderBy: { startTime: "desc" },
    });

    return json(registrations);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
