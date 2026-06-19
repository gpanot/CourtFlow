import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export async function POST(request: NextRequest) {
  try {
    const { playerId } = await requirePortalAuth(request);

    const body = await request.json();
    const { checkInPlayerId } = body as { checkInPlayerId?: string };

    if (!checkInPlayerId) {
      return error("checkInPlayerId is required", 400);
    }

    const [player, checkInPlayer] = await Promise.all([
      prisma.player.findUniqueOrThrow({ where: { id: playerId }, select: { id: true, name: true, playerIdentityId: true } }),
      prisma.checkInPlayer.findUnique({ where: { id: checkInPlayerId }, select: { id: true, name: true, playerIdentityId: true } }),
    ]);

    if (!checkInPlayer) {
      return error("CourtPay player not found", 404);
    }

    let identityId: string;

    await prisma.$transaction(async (tx) => {
      if (player.playerIdentityId) {
        identityId = player.playerIdentityId;
      } else if (checkInPlayer.playerIdentityId) {
        identityId = checkInPlayer.playerIdentityId;
      } else {
        const identity = await tx.playerIdentity.create({
          data: {
            name: player.name,
          },
          select: { id: true },
        });
        identityId = identity.id;
      }

      await tx.player.update({
        where: { id: playerId },
        data: { playerIdentityId: identityId },
      });

      await tx.checkInPlayer.update({
        where: { id: checkInPlayerId },
        data: { playerIdentityId: identityId },
      });
    });

    return json({ success: true, identityId: identityId! });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
