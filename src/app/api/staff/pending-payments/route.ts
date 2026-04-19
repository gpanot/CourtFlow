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
      select: { id: true },
    });
    const paymentScope = session
      ? [{ sessionId: session.id }, { checkInPlayerId: { not: null } }]
      : [{ checkInPlayerId: { not: null } }];

    await prisma.pendingPayment.updateMany({
      where: {
        venueId,
        status: "pending",
        expiresAt: { lt: new Date() },
        OR: paymentScope,
      },
      data: { status: "expired" },
    });

    const payments = await prisma.pendingPayment.findMany({
      where: {
        venueId,
        status: "pending",
        OR: paymentScope,
      },
      include: {
        player: { select: { id: true, name: true, skillLevel: true, facePhotoPath: true } },
        checkInPlayer: { select: { id: true, name: true, skillLevel: true, phone: true } },
      },
      orderBy: { createdAt: "asc" },
    });

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
      if (p.checkInPlayerId && !p.playerId && p.checkInPlayer?.phone) {
        const face = faceByPhone.get(p.checkInPlayer.phone) ?? null;
        return { ...p, facePhotoUrl: face };
      }
      return p;
    });

    return json(enriched);
  } catch (e) {
    console.error("[Staff Pending Payments] Error:", e);
    return error((e as Error).message, 500);
  }
}
