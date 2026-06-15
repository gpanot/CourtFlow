/**
 * GET /api/auth/player/session
 * Returns the current player session from the player_token cookie.
 * Used by the usePlayerSession hook for OAuth users (credentials users
 * already have the token in localStorage and decode it client-side).
 *
 * Response: { playerId, email, provider, onboardingComplete } | null
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyPlayerToken } from "@/app/api/public/auth/login/route";
import { verifyOAuthToken } from "@/lib/player-oauth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get("player_token")?.value;
  console.log("[player/session] cookie present:", !!cookie, "length:", cookie?.length ?? 0);
  if (!cookie) return NextResponse.json(null);

  // Try credentials token first
  const creds = verifyPlayerToken(cookie);
  if (creds) {
    const player = await prisma.player.findUnique({
      where: { id: creds.playerId },
      select: { phone: true, registrationVenueId: true },
    });
    const onboardingComplete =
      !!player &&
      !!player.phone &&
      !player.phone.startsWith("oauth_") &&
      !player.phone.startsWith("email_") &&
      !!player.registrationVenueId;
    return NextResponse.json({
      playerId: creds.playerId,
      email: creds.email,
      provider: "credentials",
      onboardingComplete,
    });
  }

  // Try OAuth token
  const oauth = verifyOAuthToken(cookie);
  if (oauth) {
    const player = await prisma.player.findUnique({
      where: { id: oauth.playerId },
      select: { phone: true, registrationVenueId: true },
    });
    const onboardingComplete =
      !!player &&
      !!player.phone &&
      !player.phone.startsWith("oauth_") &&
      !player.phone.startsWith("email_") &&
      !!player.registrationVenueId;
    return NextResponse.json({
      playerId: oauth.playerId,
      email: oauth.email,
      provider: oauth.provider,
      onboardingComplete,
    });
  }

  return NextResponse.json(null);
}

/** DELETE /api/auth/player/session — sign out by clearing the cookie */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("player_token", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  });
  return res;
}
