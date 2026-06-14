import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";
import { checkSessionLimit } from "@/lib/membership";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = requireAuth(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const membership = await prisma.membership.findUnique({
      where: {
        playerId_venueId: { playerId: auth.id, venueId },
      },
      include: {
        tier: {
          select: {
            id: true,
            name: true,
            priceValue: true,
            sessionsIncluded: true,
            showBadge: true,
          },
        },
      },
    });

    if (!membership) {
      return json({ membership: null, sessionLimit: null });
    }

    const sessionLimit = await checkSessionLimit(auth.id, venueId);

    return json({ membership, sessionLimit });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
