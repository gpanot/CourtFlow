import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

const CYCLE_DAYS = 30;

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const body = await parseBody<{
      playerId: string;
      venueId: string;
      tierId: string;
    }>(request);

    const tier = await prisma.membershipTier.findFirst({
      where: { id: body.tierId, venueId: body.venueId, isActive: true },
    });
    if (!tier) return error("Tier not found or inactive", 404);

    const player = await prisma.player.findUnique({ where: { id: body.playerId } });
    if (!player) return error("Player not found", 404);

    const now = new Date();
    const renewalDate = new Date(now);
    renewalDate.setDate(renewalDate.getDate() + CYCLE_DAYS);

    const membership = await prisma.membership.upsert({
      where: {
        playerId_venueId: { playerId: body.playerId, venueId: body.venueId },
      },
      create: {
        playerId: body.playerId,
        venueId: body.venueId,
        tierId: body.tierId,
        status: "active",
        activatedAt: now,
        renewalDate,
        sessionsUsed: 0,
      },
      update: {
        tierId: body.tierId,
        status: "active",
        activatedAt: now,
        renewalDate,
        sessionsUsed: 0,
      },
      include: {
        player: { select: { id: true, name: true, phone: true } },
        tier: { select: { id: true, name: true } },
      },
    });

    await prisma.membershipPayment.create({
      data: {
        membershipId: membership.id,
        periodStart: now,
        periodEnd: renewalDate,
        amountInCents: tier.priceInCents,
        status: "UNPAID",
      },
    });

    return json(membership, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
