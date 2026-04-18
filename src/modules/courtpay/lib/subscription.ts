import { prisma } from "@/lib/db";
import type { ActiveSubscriptionInfo } from "../types";

/**
 * Returns the currently active subscription for a player at a venue, or null.
 */
export async function getActiveSubscription(
  playerId: string
): Promise<ActiveSubscriptionInfo | null> {
  const sub = await prisma.playerSubscription.findFirst({
    where: {
      playerId,
      status: "active",
      expiresAt: { gt: new Date() },
    },
    include: { package: true },
    orderBy: { activatedAt: "desc" },
  });

  if (!sub) return null;

  const daysRemaining = Math.max(
    0,
    Math.ceil(
      (sub.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    )
  );

  return {
    id: sub.id,
    packageName: sub.package.name,
    sessionsRemaining: sub.sessionsRemaining,
    daysRemaining,
    isUnlimited: sub.package.sessions === null,
    status: sub.status,
  };
}

/**
 * Activate a subscription for a player. Creates a PlayerSubscription
 * with the full session count from the package and expiry based on durationDays.
 * No session is deducted here — the caller is responsible for calling
 * checkInSubscriber / deductSession for the current visit.
 */
export async function activateSubscription(
  playerId: string,
  packageId: string,
  venueId: string,
  paymentRef: string | null
) {
  const pkg = await prisma.subscriptionPackage.findUniqueOrThrow({
    where: { id: packageId },
  });

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + pkg.durationDays);

  const sessionsRemaining = pkg.sessions === null ? null : pkg.sessions;

  const subscription = await prisma.playerSubscription.create({
    data: {
      playerId,
      packageId,
      venueId,
      sessionsRemaining,
      expiresAt,
      paymentRef,
    },
  });

  return subscription;
}

/**
 * Deduct one session from an active subscription.
 * Creates a SubscriptionUsage record and decrements sessionsRemaining.
 * Returns the updated subscription or null if no deduction possible.
 */
export async function deductSession(subscriptionId: string) {
  const sub = await prisma.playerSubscription.findUnique({
    where: { id: subscriptionId },
    include: { package: true },
  });

  if (!sub || sub.status !== "active") return null;

  if (sub.package.sessions !== null) {
    if (sub.sessionsRemaining !== null && sub.sessionsRemaining <= 0) {
      return null;
    }

    const updated = await prisma.playerSubscription.update({
      where: { id: subscriptionId },
      data: {
        sessionsRemaining: { decrement: 1 },
        ...(sub.sessionsRemaining === 1
          ? { status: "exhausted" }
          : {}),
      },
    });

    await prisma.subscriptionUsage.create({
      data: { subscriptionId },
    });

    return updated;
  }

  // Unlimited plan — just record usage
  await prisma.subscriptionUsage.create({
    data: { subscriptionId },
  });

  return sub;
}

/**
 * Cron-safe helper: expire subscriptions past their expiresAt date.
 */
export async function expireSubscriptions() {
  const result = await prisma.playerSubscription.updateMany({
    where: {
      status: "active",
      expiresAt: { lt: new Date() },
    },
    data: { status: "expired" },
  });
  return result.count;
}
