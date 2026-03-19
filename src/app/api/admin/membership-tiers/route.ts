import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const MAX_TIERS_PER_VENUE = 4;

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const tiers = await prisma.membershipTier.findMany({
      where: { venueId },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { memberships: { where: { status: "active" } } } },
      },
    });

    return json(tiers);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const body = await parseBody<{
      venueId: string;
      name: string;
      priceInCents: number;
      sessionsIncluded?: number | null;
      showBadge?: boolean;
      perks?: string[];
    }>(request);

    const existingCount = await prisma.membershipTier.count({
      where: { venueId: body.venueId, isActive: true },
    });

    if (existingCount >= MAX_TIERS_PER_VENUE) {
      return error(`Maximum ${MAX_TIERS_PER_VENUE} tiers per venue`, 400);
    }

    const maxSort = await prisma.membershipTier.aggregate({
      where: { venueId: body.venueId },
      _max: { sortOrder: true },
    });

    const tier = await prisma.membershipTier.create({
      data: {
        venueId: body.venueId,
        name: body.name,
        priceInCents: body.priceInCents,
        sessionsIncluded: body.sessionsIncluded ?? null,
        showBadge: body.showBadge ?? false,
        perks: body.perks ?? [],
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });

    return json(tier, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
