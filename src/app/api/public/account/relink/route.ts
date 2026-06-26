import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export async function POST(request: NextRequest) {
  try {
    const { playerId: currentPlayerId } = await requirePortalAuth(request);
    const body = await request.json();
    const { link, phone, gender, skillLevel } = body as {
      link: boolean;
      phone: string;
      gender?: string;
      skillLevel?: string;
    };

    const normalizedPhone = phone.replace(/\s+/g, "");

    if (link) {
      const { checkInPlayerId } = body as { checkInPlayerId?: string };
      if (!checkInPlayerId) return error("checkInPlayerId is required", 400);

      // Look up both sides
      const [courtPassPlayer, checkInPlayer] = await Promise.all([
        prisma.player.findUnique({
          where: { id: currentPlayerId },
          select: { id: true, name: true, playerIdentityId: true },
        }),
        prisma.checkInPlayer.findUnique({
          where: { id: checkInPlayerId },
          select: { id: true, playerIdentityId: true },
        }),
      ]);

      if (!courtPassPlayer) return error("Player not found", 404);
      if (!checkInPlayer) return error("CourtPay check-in player not found", 404);

      // Reuse existing identity or create a new one — same logic as link-courtpay
      let identityId: string;
      await prisma.$transaction(async (tx) => {
        if (courtPassPlayer.playerIdentityId) {
          identityId = courtPassPlayer.playerIdentityId;
        } else if (checkInPlayer.playerIdentityId) {
          identityId = checkInPlayer.playerIdentityId;
        } else {
          const identity = await tx.playerIdentity.create({
            data: { name: courtPassPlayer.name },
            select: { id: true },
          });
          identityId = identity.id;
        }

        // Link CourtPass player to the shared identity and save confirmed phone
        await tx.player.update({
          where: { id: currentPlayerId },
          data: { playerIdentityId: identityId, phone: normalizedPhone },
        });

        // Link CourtPay CheckInPlayer to the same identity
        await tx.checkInPlayer.update({
          where: { id: checkInPlayerId },
          data: { playerIdentityId: identityId },
        });
      });

      return json({ playerId: currentPlayerId });
    }

    const uniquePhone = `${normalizedPhone}_${Date.now()}`;
    const updated = await prisma.player.update({
      where: { id: currentPlayerId },
      data: {
        phone: uniquePhone,
        gender: gender as "male" | "female",
        skillLevel: skillLevel as "beginner" | "intermediate" | "advanced" | "pro",
      },
    });

    return json({ playerId: updated.id });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    console.error("[relink] error:", msg);
    return error("Account linking failed. Please try again.", 500);
  }
}
