import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;
    const body = await parseBody<{
      name?: string;
      priceInCents?: number;
      sessionsIncluded?: number | null;
      showBadge?: boolean;
      sortOrder?: number;
      perks?: string[];
    }>(request);

    const existing = await prisma.membershipTier.findUnique({ where: { id } });
    if (!existing) return notFound("Tier not found");

    const tier = await prisma.membershipTier.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.priceInCents !== undefined && { priceInCents: body.priceInCents }),
        ...(body.sessionsIncluded !== undefined && { sessionsIncluded: body.sessionsIncluded }),
        ...(body.showBadge !== undefined && { showBadge: body.showBadge }),
        ...(body.perks !== undefined && { perks: body.perks }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
      },
    });

    return json(tier);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;

    const existing = await prisma.membershipTier.findUnique({ where: { id } });
    if (!existing) return notFound("Tier not found");

    const activeMembers = await prisma.membership.count({
      where: { tierId: id, status: "active" },
    });

    if (activeMembers > 0) {
      return error(
        `Cannot deactivate tier with ${activeMembers} active member(s). Suspend or cancel their memberships first.`,
        400
      );
    }

    const tier = await prisma.membershipTier.update({
      where: { id },
      data: { isActive: false },
    });

    return json(tier);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
