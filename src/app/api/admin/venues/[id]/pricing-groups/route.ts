import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { parsePricingMatrix, type PricingRule } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { id: venueId } = await params;

    const groups = await prisma.pricingGroup.findMany({
      where: { venueId },
      orderBy: { sortOrder: "asc" },
      include: {
        _count: { select: { courts: true } },
      },
    });

    return json(groups);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { id: venueId } = await params;

    const body = await parseBody<{
      name: string;
      defaultPriceValue?: number;
      pricingRules?: PricingRule[];
      sortOrder?: number;
    }>(request);

    if (!body.name?.trim()) {
      return error("name is required", 400);
    }

    // Verify venue exists
    const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { id: true } });
    if (!venue) return error("Venue not found", 404);

    // If this is the first group for the venue, make it the default automatically.
    const existingCount = await prisma.pricingGroup.count({ where: { venueId } });
    const isFirst = existingCount === 0;

    // Determine sort order
    const maxSort = await prisma.pricingGroup.aggregate({
      where: { venueId },
      _max: { sortOrder: true },
    });
    const sortOrder = body.sortOrder ?? (maxSort._max.sortOrder ?? -1) + 1;

    // Normalize the incoming matrix
    const matrix = parsePricingMatrix({
      defaultPriceValue: body.defaultPriceValue ?? 0,
      pricingRules: body.pricingRules ?? [],
    });

    const group = await prisma.pricingGroup.create({
      data: {
        id: `pg_${Math.random().toString(36).slice(2, 18)}`,
        venueId,
        name: body.name.trim(),
        sortOrder,
        isDefault: isFirst,
        isUnconfigured: matrix.defaultPriceValue === 0 && matrix.pricingRules.length === 0,
        defaultPriceValue: matrix.defaultPriceValue,
        pricingRules: matrix.pricingRules as unknown as Parameters<typeof prisma.pricingGroup.create>[0]["data"]["pricingRules"],
        updatedAt: new Date(),
      },
    });

    return json(group, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
