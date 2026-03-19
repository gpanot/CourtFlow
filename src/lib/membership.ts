import { prisma } from "./db";
import type { Membership } from "@prisma/client";

const CYCLE_DAYS = 30;

export interface SessionLimitResult {
  allowed: boolean;
  used: number;
  limit: number | null;
  isUnlimited: boolean;
}

/**
 * If the membership's renewal date has passed, reset sessionsUsed and
 * advance renewalDate forward in 30-day increments until it's in the future.
 * Returns the updated membership.
 */
export async function checkAndResetCycle(membership: Membership): Promise<Membership> {
  const now = new Date();
  if (membership.renewalDate > now) return membership;

  const previousRenewal = new Date(membership.renewalDate);
  let nextRenewal = new Date(membership.renewalDate);
  while (nextRenewal <= now) {
    nextRenewal.setDate(nextRenewal.getDate() + CYCLE_DAYS);
  }

  const updated = await prisma.membership.update({
    where: { id: membership.id },
    data: {
      sessionsUsed: 0,
      renewalDate: nextRenewal,
    },
    include: { tier: true },
  });

  const existingPayment = await prisma.membershipPayment.findFirst({
    where: {
      membershipId: membership.id,
      periodStart: previousRenewal,
    },
  });

  if (!existingPayment) {
    await prisma.membershipPayment.create({
      data: {
        membershipId: membership.id,
        periodStart: previousRenewal,
        periodEnd: nextRenewal,
        amountInCents: updated.tier.priceInCents,
        status: "UNPAID",
      },
    });
  }

  return updated;
}

/**
 * Check whether a player can still play under their membership session limit.
 * Automatically resets the cycle if the renewal date has passed.
 */
export async function checkSessionLimit(
  playerId: string,
  venueId: string
): Promise<SessionLimitResult> {
  let membership = await prisma.membership.findUnique({
    where: { playerId_venueId: { playerId, venueId } },
    include: { tier: true },
  });

  if (!membership || membership.status !== "active") {
    return { allowed: true, used: 0, limit: null, isUnlimited: true };
  }

  membership = await checkAndResetCycle(membership) as typeof membership;

  const sessionsIncluded = membership.tier.sessionsIncluded;
  if (sessionsIncluded === null) {
    return { allowed: true, used: membership.sessionsUsed, limit: null, isUnlimited: true };
  }

  return {
    allowed: membership.sessionsUsed < sessionsIncluded,
    used: membership.sessionsUsed,
    limit: sessionsIncluded,
    isUnlimited: false,
  };
}

/**
 * Increment the session counter for a player's membership at a venue.
 * Called when a player joins open play. No-ops for Drop-in (no membership).
 */
export async function incrementSessionCount(
  playerId: string,
  venueId: string
): Promise<void> {
  const membership = await prisma.membership.findUnique({
    where: { playerId_venueId: { playerId, venueId } },
  });

  if (!membership || membership.status !== "active") return;

  const refreshed = await checkAndResetCycle(membership);

  await prisma.membership.update({
    where: { id: refreshed.id },
    data: { sessionsUsed: { increment: 1 } },
  });
}

/**
 * Batch helper: mark memberships as expired when they haven't been renewed
 * past their renewal date (with a grace buffer). Intended for a cron job.
 */
export async function expireMemberships(): Promise<number> {
  const now = new Date();

  await prisma.membershipPayment.updateMany({
    where: {
      status: "UNPAID",
      periodEnd: { lt: now },
    },
    data: { status: "OVERDUE" },
  });

  const result = await prisma.membership.updateMany({
    where: {
      status: "active",
      renewalDate: { lt: now },
    },
    data: { status: "expired" },
  });
  return result.count;
}
