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
      const existingPlayer = await prisma.player.findUnique({
        where: { id: existingPlayerId },
      });
      if (!existingPlayer) return error("Player not found", 404);

      await prisma.$transaction(async (tx) => {
        await tx.playerAccount.updateMany({
          where: { playerId: currentPlayerId },
          data: { playerId: existingPlayerId },
        });

        if (gender) {
          await tx.player.update({
            where: { id: existingPlayerId },
            data: {
              gender: gender as "male" | "female",
              skillLevel: (skillLevel as "beginner" | "intermediate" | "advanced" | "pro") ?? existingPlayer.skillLevel,
            },
          });
        }

        await tx.player.delete({ where: { id: currentPlayerId } });
      });

      return json({ playerId: existingPlayerId });
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
    return error(msg, 500);
  }
}
