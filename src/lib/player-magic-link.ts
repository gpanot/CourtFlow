/**
 * Magic login link — one-time login URLs for players whose accounts were
 * created by the booking agent and have never set a password.
 *
 * Flow:
 *   1. Bot calls createMagicLoginToken(playerId) → gets a URL.
 *   2. Bot sends URL to player (e.g. via Messenger / Zalo).
 *   3. Player clicks → GET /auth/magic?token=<jwt> on the CourtPass host,
 *      which is server-rewritten to /book/auth/magic (Next.js beforeFiles rewrite).
 *   4. Server verifies JWT (type=magic_login, not expired, jti not used).
 *   5. Server marks the DB row used, mints a normal 30-day session token,
 *      and redirects to /book/auth/magic?session=<session-jwt>[&next=<path>] (client page).
 *   6. Client page writes session token to localStorage then → redirectTo or /book/bookings.
 *
 * Single-use enforcement:
 *   The JWT carries a `jti` (JWT ID). On first visit the server writes
 *   `usedAt = now()` to the `player_magic_tokens` row.  Any subsequent visit
 *   finds `usedAt` already set and returns 410 Gone.
 *
 * Expiry:
 *   Default TTL is 5 minutes (for bot-generated login links).
 *   Payment-link magic tokens use a 7-day TTL so booking confirmation emails
 *   remain useful for a week.
 */

import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { prisma } from "./db";

const PLAYER_JWT_SECRET =
  process.env.PLAYER_JWT_SECRET ||
  process.env.JWT_SECRET ||
  "courtflow-dev-secret-change-in-production";

const MAGIC_TOKEN_TTL_SECONDS = 5 * 60;           // 5 min — bot links
const PAYMENT_MAGIC_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days — email pay links

export const TOKEN_TYPE_MAGIC = "magic_login" as const;

export interface MagicLoginTokenPayload {
  playerId: string;
  type: typeof TOKEN_TYPE_MAGIC;
  jti: string;
  /** Optional path the client should navigate to after login (e.g. /book/pay/:id) */
  redirectTo?: string;
}

function getBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_COURTPASS_URL ?? "https://courtpass.thecourtflow.com"
  ).replace(/\/$/, "");
}

/**
 * Creates a one-time magic login URL for the given player.
 *
 * Persists a `PlayerMagicToken` row to enforce single-use semantics server-side.
 * Returns the full absolute URL the booking agent should send to the player.
 *
 * @param playerId    Prisma Player.id
 * @param redirectTo  Optional path to navigate to after login (e.g. /book/pay/:id).
 *                    When provided the token TTL is extended to 7 days.
 * @returns           { url } — full HTTPS URL, single-use
 */
export async function createMagicLoginToken(
  playerId: string,
  redirectTo?: string
): Promise<{ url: string }> {
  const jti = randomUUID();
  const ttl = redirectTo ? PAYMENT_MAGIC_TOKEN_TTL_SECONDS : MAGIC_TOKEN_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const payload: MagicLoginTokenPayload = {
    playerId,
    type: TOKEN_TYPE_MAGIC,
    jti,
    ...(redirectTo ? { redirectTo } : {}),
  };

  const token = jwt.sign(payload, PLAYER_JWT_SECRET, { expiresIn: ttl });

  await prisma.playerMagicToken.create({
    data: { playerId, jti, expiresAt },
  });

  const url = `${getBaseUrl()}/auth/magic?token=${token}`;
  return { url };
}

/**
 * Verifies and consumes a magic login token.
 *
 * Returns the playerId and optional redirectTo path on success.
 * Throws a MagicLinkError with a machine-readable code on all failure paths.
 */
export class MagicLinkError extends Error {
  constructor(
    message: string,
    public readonly code: "expired" | "already_used" | "invalid"
  ) {
    super(message);
    this.name = "MagicLinkError";
  }
}

export async function consumeMagicLoginToken(
  rawToken: string
): Promise<{ playerId: string; redirectTo?: string }> {
  let payload: MagicLoginTokenPayload;

  try {
    payload = jwt.verify(rawToken, PLAYER_JWT_SECRET) as MagicLoginTokenPayload;
  } catch (e) {
    const isExpired = (e as Error).name === "TokenExpiredError";
    throw new MagicLinkError(
      isExpired ? "This login link has expired." : "Invalid login link.",
      isExpired ? "expired" : "invalid"
    );
  }

  if (payload.type !== TOKEN_TYPE_MAGIC) {
    throw new MagicLinkError("Invalid login link.", "invalid");
  }

  const row = await prisma.playerMagicToken.findUnique({
    where: { jti: payload.jti },
    select: { id: true, usedAt: true, expiresAt: true },
  });

  if (!row) {
    throw new MagicLinkError("Invalid login link.", "invalid");
  }

  if (row.usedAt !== null) {
    throw new MagicLinkError(
      "This login link has already been used.",
      "already_used"
    );
  }

  await prisma.playerMagicToken.update({
    where: { id: row.id },
    data: { usedAt: new Date() },
  });

  return {
    playerId: payload.playerId,
    ...(payload.redirectTo ? { redirectTo: payload.redirectTo } : {}),
  };
}
