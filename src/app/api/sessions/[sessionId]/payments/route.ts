import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    requireStaff(request.headers);

    const { sessionId } = await params;
    if (!sessionId?.trim()) return error("sessionId is required", 400);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, venueId: true, openedAt: true, closedAt: true },
    });
    if (!session) return error("Session not found", 404);

    // All confirmed payments that belong to this session:
    // 1. Directly linked by sessionId (self check-in flow)
    // 2. CourtPay payments confirmed during the session window (no sessionId FK)
    const payments = await prisma.pendingPayment.findMany({
      where: {
        venueId: session.venueId,
        status: "confirmed",
        OR: [
          { sessionId: session.id },
          {
            checkInPlayerId: { not: null },
            confirmedAt: {
              gte: session.openedAt,
              ...(session.closedAt ? { lte: session.closedAt } : {}),
            },
          },
        ],
      },
      include: {
        player: { select: { id: true, name: true, phone: true, skillLevel: true, facePhotoPath: true, reclubUserId: true } },
        checkInPlayer: { select: { id: true, name: true, skillLevel: true, phone: true } },
      },
      orderBy: { confirmedAt: "desc" },
    });

    const courtPayPhones = [
      ...new Set(
        payments
          .filter((p) => p.checkInPlayerId && !p.playerId && p.checkInPlayer?.phone)
          .map((p) => p.checkInPlayer!.phone)
      ),
    ];
    const linkedPlayers =
      courtPayPhones.length > 0
        ? await prisma.player.findMany({
            where: { phone: { in: courtPayPhones } },
            select: { id: true, phone: true, name: true, facePhotoPath: true, avatarPhotoPath: true, reclubUserId: true },
          })
        : [];
    const faceByPhone = new Map(
      linkedPlayers.map((p) => [
        p.phone,
        p.avatarPhotoPath ?? p.facePhotoPath ?? null,
      ])
    );
    const playerByPhone = new Map(
      linkedPlayers.map((p) => [p.phone, p])
    );

    const subscriptionPlayerIds = [
      ...new Set(payments.map((p) => p.checkInPlayerId).filter((v): v is string => Boolean(v))),
    ];
    const subscriptions =
      subscriptionPlayerIds.length > 0
        ? await prisma.playerSubscription.findMany({
            where: { playerId: { in: subscriptionPlayerIds } },
            select: {
              playerId: true,
              status: true,
              sessionsRemaining: true,
              expiresAt: true,
              activatedAt: true,
              package: { select: { name: true, sessions: true } },
            },
            orderBy: [{ playerId: "asc" }, { activatedAt: "desc" }],
          })
        : [];
    const subscriptionByPlayer = new Map<
      string,
      {
        packageName: string;
        sessionsRemaining: number | null;
        isUnlimited: boolean;
        daysRemaining: number;
        status: string;
      }
    >();
    for (const sub of subscriptions) {
      if (subscriptionByPlayer.has(sub.playerId)) continue;
      const daysRemaining = Math.max(
        0,
        Math.ceil((sub.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
      );
      subscriptionByPlayer.set(sub.playerId, {
        packageName: sub.package.name,
        sessionsRemaining: sub.sessionsRemaining,
        isUnlimited: sub.package.sessions === null,
        daysRemaining,
        status: sub.status,
      });
    }

    const enriched = payments.map((p) => {
      const subscriptionInfo = p.checkInPlayerId
        ? subscriptionByPlayer.get(p.checkInPlayerId) ?? null
        : null;
      if (p.checkInPlayerId && !p.playerId && p.checkInPlayer?.phone) {
        const resolvedPlayer = playerByPhone.get(p.checkInPlayer.phone);
        return {
          ...p,
          facePhotoUrl: faceByPhone.get(p.checkInPlayer.phone) ?? null,
          subscriptionInfo,
          ...(resolvedPlayer
            ? {
                player: {
                  id: resolvedPlayer.id,
                  name: resolvedPlayer.name,
                  phone: resolvedPlayer.phone,
                  facePhotoPath: resolvedPlayer.facePhotoPath,
                  reclubUserId: resolvedPlayer.reclubUserId,
                  skillLevel: null,
                },
              }
            : {}),
        };
      }
      return { ...p, subscriptionInfo };
    });

    const totalRevenue = enriched.reduce((sum, p) => sum + p.amount, 0);

    return json({
      payments: enriched,
      summary: {
        total: enriched.length,
        totalRevenue,
        cash: enriched.filter((p) => p.paymentMethod === "cash").length,
        qr: enriched.filter((p) => p.paymentMethod !== "cash" && p.paymentMethod !== "subscription").length,
        subscription: enriched.filter((p) => p.paymentMethod === "subscription" || p.type === "subscription").length,
      },
    });
  } catch (e) {
    console.error("[Session Payments]", e);
    return error((e as Error).message, 500);
  }
}
