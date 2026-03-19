import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireAuth(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const tiers = await prisma.membershipTier.findMany({
      where: { venueId, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        priceInCents: true,
        sessionsIncluded: true,
        showBadge: true,
        sortOrder: true,
      },
    });

    return json(tiers);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
