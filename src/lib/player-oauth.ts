/**
 * Shared helpers for Google + Apple raw OAuth flows.
 *
 * Flow:
 *   1. Callback route receives the authorization code (or Apple id_token).
 *   2. findOrCreateOAuthPlayer() finds or creates a Player + PlayerAccount.
 *   3. issuePlayerOAuthToken() signs a JWT and returns it for cookie storage.
 *
 * The JWT is stored as an httpOnly cookie named "player_token" (same name as
 * credentials tokens so all API routes read it uniformly) but with
 * type = "player_oauth" to distinguish from credentials tokens.
 */
import jwt from "jsonwebtoken";
import { prisma } from "@/lib/db";
import { ResponseCookies } from "next/dist/compiled/@edge-runtime/cookies";

const PLAYER_JWT_SECRET =
  process.env.PLAYER_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "courtflow-dev-secret-change-in-production";

export const PLAYER_OAUTH_COOKIE = "player_token";
export const TOKEN_TYPE_OAUTH = "player_oauth";

export interface PlayerOAuthTokenPayload {
  playerId: string;
  email: string | null;
  type: "player_oauth";
  provider: string;
}

export function signOAuthToken(payload: Omit<PlayerOAuthTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: TOKEN_TYPE_OAUTH }, PLAYER_JWT_SECRET, {
    expiresIn: "30d",
  });
}

export function verifyOAuthToken(token: string): PlayerOAuthTokenPayload | null {
  try {
    const decoded = jwt.verify(token, PLAYER_JWT_SECRET) as PlayerOAuthTokenPayload;
    if (decoded.type !== TOKEN_TYPE_OAUTH) return null;
    return decoded;
  } catch {
    return null;
  }
}

/** Set the player_token httpOnly cookie on a Response's headers. */
export function setOAuthCookie(
  headers: Headers,
  token: string,
  secure: boolean = true
) {
  const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds
  const cookieValue = [
    `player_token=${token}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Max-Age=${maxAge}`,
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
  headers.append("Set-Cookie", cookieValue);
}

export interface OAuthProfile {
  providerAccountId: string; // "sub" from Google or Apple id_token
  email: string | null;
  name: string | null;
  image: string | null;
}

/**
 * Find existing PlayerAccount or create a new Player + PlayerAccount.
 * Returns the player's ID.
 */
export async function findOrCreateOAuthPlayer(
  provider: string,
  profile: OAuthProfile
): Promise<string> {
  const { providerAccountId, email, name, image } = profile;

  const existing = await prisma.playerAccount.findUnique({
    where: {
      provider_providerAccountId: { provider, providerAccountId },
    },
    select: { playerId: true },
  });

  if (existing) return existing.playerId;

  const player = await prisma.player.create({
    data: {
      name: name ?? "Player",
      email,
      phone: `oauth_${provider}_${providerAccountId}`,
      gender: "male",
      skillLevel: "beginner",
    },
  });

  await prisma.playerAccount.create({
    data: {
      playerId: player.id,
      provider,
      providerAccountId,
      email,
      name: name ?? "Player",
      image,
    },
  });

  return player.id;
}
