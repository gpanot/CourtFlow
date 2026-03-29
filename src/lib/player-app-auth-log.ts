import { prisma } from "@/lib/db";
import type { PlayerAppAuthMethod } from "@prisma/client";

export async function logPlayerAppAuth(
  playerId: string,
  method: PlayerAppAuthMethod,
  sessionId?: string | null
): Promise<void> {
  try {
    await prisma.playerAppAuthLog.create({
      data: {
        playerId,
        method,
        sessionId: sessionId ?? undefined,
      },
    });
  } catch (e) {
    console.error("[playerAppAuthLog]", e);
  }
}
