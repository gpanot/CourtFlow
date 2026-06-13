import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth();
    const { id } = await params;

    const credit = await prisma.playerCoachCredit.findFirst({
      where: { id, playerId },
      include: {
        coach: { select: { name: true } },
        package: { select: { name: true } },
      },
    });
    if (!credit) return error("Credit not found", 404);

    return json(credit);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
