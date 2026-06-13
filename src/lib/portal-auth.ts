import { auth } from "@/lib/player-auth";
import { verifyPlayerToken } from "@/app/api/public/auth/login/route";
import { NextRequest } from "next/server";

/**
 * Resolves the current player ID from either:
 *  1. A player_token Bearer header (email/password credentials flow), OR
 *  2. The NextAuth session (Google/Apple OAuth flow)
 *
 * API routes that need the player_token must forward the Authorization header.
 * Client components call fetch() with { headers: { Authorization: `Bearer ${getPlayerToken()}` } }
 */
export async function requirePortalAuth(
  request?: NextRequest
): Promise<{ playerId: string }> {
  // Path 1: Bearer token from credentials login
  const authHeader = request?.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyPlayerToken(token);
    if (payload?.playerId) {
      return { playerId: payload.playerId };
    }
  }

  // Path 2: NextAuth OAuth session
  const session = await auth();
  if (session?.playerId) {
    return { playerId: session.playerId };
  }

  throw new Error("Authentication required");
}
