import { verifyPlayerToken } from "@/app/api/public/auth/login/route";
import { verifyOAuthToken } from "@/lib/player-oauth";
import { NextRequest } from "next/server";

/**
 * Resolves the current player ID from either:
 *  1. A Bearer token in the Authorization header (email/password flow), OR
 *  2. The player_token httpOnly cookie (OAuth or credentials flow)
 *
 * Throws if neither path yields a valid player ID.
 */
export async function requirePortalAuth(
  request?: NextRequest
): Promise<{ playerId: string }> {
  // Path 1: Bearer token from Authorization header (credentials login)
  const authHeader = request?.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyPlayerToken(token);
    if (payload?.playerId) return { playerId: payload.playerId };
  }

  // Path 2: player_token cookie (credentials or OAuth)
  const cookieToken = request?.cookies.get("player_token")?.value;
  if (cookieToken) {
    const creds = verifyPlayerToken(cookieToken);
    if (creds?.playerId) return { playerId: creds.playerId };

    const oauth = verifyOAuthToken(cookieToken);
    if (oauth?.playerId) return { playerId: oauth.playerId };
  }

  throw new Error("Authentication required");
}
