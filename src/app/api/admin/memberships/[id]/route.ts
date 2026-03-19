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
      status?: "suspended" | "cancelled";
      sessionsUsed?: number;
      tierId?: string;
    }>(request);

    const existing = await prisma.membership.findUnique({
      where: { id },
      include: { tier: true },
    });
    if (!existing) return notFound("Membership not found");

    const data: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!["suspended", "cancelled"].includes(body.status)) {
        return error("Status must be 'suspended' or 'cancelled'", 400);
      }
      data.status = body.status;
    }

    if (body.sessionsUsed !== undefined) {
      data.sessionsUsed = Math.max(0, body.sessionsUsed);
    }

    if (body.tierId !== undefined && body.tierId !== existing.tierId) {
      const newTier = await prisma.membershipTier.findFirst({
        where: { id: body.tierId, venueId: existing.venueId, isActive: true },
      });
      if (!newTier) return error("Tier not found or inactive", 404);

      data.tierId = body.tierId;

      const currentPayment = await prisma.membershipPayment.findFirst({
        where: { membershipId: id },
        orderBy: { periodStart: "desc" },
      });

      if (currentPayment && currentPayment.status !== "PAID") {
        await prisma.membershipPayment.update({
          where: { id: currentPayment.id },
          data: {
            amountInCents: newTier.priceInCents,
            note: `Tier changed from ${existing.tier.name} to ${newTier.name}`,
          },
        });
      }
    }

    const membership = await prisma.membership.update({
      where: { id },
      data,
      include: {
        player: { select: { id: true, name: true, phone: true } },
        tier: { select: { id: true, name: true } },
      },
    });

    return json(membership);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
