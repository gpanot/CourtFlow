import { auth } from "@/lib/player-auth";

export async function requirePortalAuth(): Promise<{ playerId: string }> {
  const session = await auth();
  if (!session?.playerId) {
    throw new Error("Authentication required");
  }
  return { playerId: session.playerId };
}
