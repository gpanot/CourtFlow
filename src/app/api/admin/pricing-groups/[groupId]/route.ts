import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, notFound, parseBody } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { parsePricingMatrix, type PricingRule } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { groupId } = await params;

    const body = await parseBody<{
      name?: string;
      defaultPriceValue?: number;
      pricingRules?: PricingRule[];
      sortOrder?: number;
      isDefault?: boolean;
    }>(request);

    const existing = await prisma.pricingGroup.findUnique({ where: { id: groupId } });
    if (!existing) return notFound("Pricing group not found");

    const data: Parameters<typeof prisma.pricingGroup.update>[0]["data"] = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) {
      if (!body.name.trim()) return error("name cannot be empty", 400);
      data.name = body.name.trim();
    }

    if (body.sortOrder !== undefined) {
      data.sortOrder = body.sortOrder;
    }

    if (body.defaultPriceValue !== undefined || body.pricingRules !== undefined) {
      const matrix = parsePricingMatrix({
        defaultPriceValue: body.defaultPriceValue ?? existing.defaultPriceValue,
        pricingRules: body.pricingRules ?? (existing.pricingRules as unknown as PricingRule[]),
      });
      data.defaultPriceValue = matrix.defaultPriceValue;
      data.pricingRules = matrix.pricingRules as unknown as Parameters<typeof prisma.pricingGroup.update>[0]["data"]["pricingRules"];
      // Clear the unconfigured flag when a non-zero price is set
      if (matrix.defaultPriceValue > 0 || matrix.pricingRules.length > 0) {
        data.isUnconfigured = false;
      }
    }

    // Toggling isDefault: swap in a transaction to maintain the partial unique constraint.
    if (body.isDefault === true && !existing.isDefault) {
      const updated = await prisma.$transaction(async (tx) => {
        // Unset current default for this venue
        await tx.pricingGroup.updateMany({
          where: { venueId: existing.venueId, isDefault: true },
          data: { isDefault: false },
        });
        return tx.pricingGroup.update({
          where: { id: groupId },
          data: { ...data, isDefault: true },
        });
      });
      return json(updated);
    }

    const updated = await prisma.pricingGroup.update({ where: { id: groupId }, data });
    return json(updated);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { groupId } = await params;

    const existing = await prisma.pricingGroup.findUnique({
      where: { id: groupId },
      include: { _count: { select: { courts: true } } },
    });
    if (!existing) return notFound("Pricing group not found");

    if (existing.isDefault) {
      return error("Cannot delete the default pricing group. Set another group as default first.", 400);
    }

    if (existing._count.courts > 0) {
      return error(
        `Cannot delete — ${existing._count.courts} court(s) are assigned to this group. Reassign or clear them first.`,
        400
      );
    }

    await prisma.pricingGroup.delete({ where: { id: groupId } });
    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
