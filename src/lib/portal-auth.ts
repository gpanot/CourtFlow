import { verifyPlayerToken } from "@/app/api/public/auth/login/route";
import { verifyOAuthToken } from "@/lib/player-oauth";
import { prisma } from "@/lib/db";
import { NextRequest } from "next/server";

/**
 * Resolves the current player ID from either:
 *  1. A Bearer token in the Authorization header (email/password flow), OR
 *  2. The player_token httpOnly cookie (OAuth or credentials flow)
 *
 * Also loads coachStaffId from the Player record if set.
 * Throws if neither path yields a valid player ID.
 */
export async function requirePortalAuth(
  request?: NextRequest
): Promise<{ playerId: string; coachStaffId: string | null }> {
  let playerId: string | null = null;

  // Path 1: Bearer token from Authorization header (credentials login)
  const authHeader = request?.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const payload = verifyPlayerToken(token);
    if (payload?.playerId) playerId = payload.playerId;
  }

  // Path 2: player_token cookie (credentials or OAuth)
  if (!playerId) {
    const cookieToken = request?.cookies.get("player_token")?.value;
    if (cookieToken) {
      const creds = verifyPlayerToken(cookieToken);
      if (creds?.playerId) playerId = creds.playerId;

      if (!playerId) {
        const oauth = verifyOAuthToken(cookieToken);
        if (oauth?.playerId) playerId = oauth.playerId;
      }
    }
  }

  if (!playerId) throw new Error("Authentication required");

  // Load coachStaffId — lightweight query, only fetches one nullable field
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { coachStaffId: true },
  });

  return { playerId, coachStaffId: player?.coachStaffId ?? null };
}
