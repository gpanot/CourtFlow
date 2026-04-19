import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId?.trim()) return error("venueId is required", 400);

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
      select: { id: true, openedAt: true },
    });
    // Paid tab must show only the ongoing session's confirmed payments.
    // If no open session exists, return empty paid list.
    if (!session) {
      return json({
        payments: [],
        summary: { playerCount: 0, totalRevenue: 0 },
      });
    }

    const paymentScope = [
      { sessionId: session.id },
      {
        checkInPlayerId: { not: null },
        confirmedAt: { gte: session.openedAt },
      },
    ];

    const payments = await prisma.pendingPayment.findMany({
      where: {
        venueId,
        OR: [
          { status: "confirmed", OR: paymentScope },
          { status: "cancelled", cancelReason: { not: null }, OR: paymentScope },
        ],
      },
      include: {
        player: { select: { id: true, name: true, skillLevel: true, facePhotoPath: true } },
        checkInPlayer: { select: { id: true, name: true, skillLevel: true, phone: true } },
      },
      orderBy: { confirmedAt: "desc" },
    });

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

    // For CourtPay payments (checkInPlayerId set, no player), attach face photo via phone lookup
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
            select: { phone: true, facePhotoPath: true, avatarPhotoPath: true },
          })
        : [];
    const faceByPhone = new Map(
      linkedPlayers.map((p) => [
        p.phone,
        p.avatarPhotoPath ?? p.facePhotoPath ?? null,
      ])
    );

    const enriched = payments.map((p) => {
      const subscriptionInfo = p.checkInPlayerId
        ? subscriptionByPlayer.get(p.checkInPlayerId) ?? null
        : null;
      if (p.checkInPlayerId && !p.playerId && p.checkInPlayer?.phone) {
        const face = faceByPhone.get(p.checkInPlayer.phone) ?? null;
        return { ...p, facePhotoUrl: face, subscriptionInfo };
      }
      return { ...p, subscriptionInfo };
    });

    const confirmed = enriched.filter((p) => p.status === "confirmed");
    const playerCount = confirmed.length;
    const totalRevenue = confirmed.reduce((sum, p) => sum + p.amount, 0);

    return json({
      payments: enriched,
      summary: { playerCount, totalRevenue },
    });
  } catch (e) {
    console.error("[Staff Paid Payments] Error:", e);
    return error((e as Error).message, 500);
  }
}
