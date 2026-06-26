import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export async function POST(request: NextRequest) {
  try {
    const { playerId: currentPlayerId } = await requirePortalAuth(request);
    const body = await request.json();
    const { existingPlayerId, link, phone, gender, skillLevel } = body as {
      existingPlayerId: string;
      link: boolean;
      phone: string;
      gender: string;
      skillLevel: string;
    };

    const normalizedPhone = phone.replace(/\s+/g, "");

    if (link) {
      // CourtPass is the source of truth — we never overwrite its data or delete it.
      // We only set the playerIdentityId on the current CourtPass player so it is
      // linked to the CourtPay face identity, and store the confirmed phone number.
      const courtPayPlayer = await prisma.player.findUnique({
        where: { id: existingPlayerId },
        select: { playerIdentityId: true },
      });
      if (!courtPayPlayer) return error("CourtPay player not found", 404);

      await prisma.player.update({
        where: { id: currentPlayerId },
        data: {
          phone: normalizedPhone,
          ...(courtPayPlayer.playerIdentityId
            ? { playerIdentityId: courtPayPlayer.playerIdentityId }
            : {}),
        },
      });

      // The current player is NOT deleted — CourtPass is the source of truth.
      // The existing token remains valid; just return success.
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
