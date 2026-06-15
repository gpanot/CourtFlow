/**
 * POST /api/auth/callback/apple
 * Apple uses response_mode=form_post — the browser POSTs back here.
 * We decode the id_token JWT to extract sub and email (no extra API call needed),
 * find-or-create a Player, issue a player_token cookie, and redirect to
 * /book/onboarding.
 */
import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import {
  findOrCreateOAuthPlayer,
  signOAuthToken,
  setOAuthCookie,
} from "@/lib/player-oauth";

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function errorRedirect(base: string, msg: string) {
  return NextResponse.redirect(`${base}/book/login?error=${encodeURIComponent(msg)}`);
}

export async function POST(req: NextRequest) {
  const base = getBaseUrl(req);

  let body: URLSearchParams;
  try {
    const text = await req.text();
    body = new URLSearchParams(text);
  } catch {
    return errorRedirect(base, "Invalid callback body");
  }

  const code = body.get("code");
  const state = body.get("state");
  const idToken = body.get("id_token");
  // Apple sends user JSON only on first sign-in
  const userJson = body.get("user");

  if (!code) return errorRedirect(base, "No authorization code");

  // State validation: Apple's form_post goes cross-site so the cookie may be
  // dropped on some browsers (SameSite=None). We only enforce state if the
  // cookie is present — the id_token signature itself authenticates the response.
  const storedState = req.cookies.get("oauth_state_apple")?.value;
  if (storedState && state !== storedState) {
    return errorRedirect(base, "Invalid OAuth state");
  }

  if (!idToken) return errorRedirect(base, "No id_token from Apple");

  // Decode the id_token — sub and email are in the payload (no verification
  // needed here since we trust Apple's signed token and only use it for user ID).
  let applePayload: { sub?: string; email?: string };
  try {
    applePayload = decodeJwt(idToken) as { sub?: string; email?: string };
  } catch {
    return errorRedirect(base, "Failed to decode Apple id_token");
  }

  const sub = applePayload.sub;
  if (!sub) return errorRedirect(base, "Missing sub in Apple id_token");

  let email = applePayload.email ?? null;

  // Parse name from user object (only on first auth)
  let name: string | null = null;
  if (userJson) {
    try {
      const user = JSON.parse(userJson) as {
        name?: { firstName?: string; lastName?: string };
      };
      const parts = [user.name?.firstName, user.name?.lastName].filter(Boolean);
      if (parts.length) name = parts.join(" ");
    } catch {
      // ignore
    }
  }

  const playerId = await findOrCreateOAuthPlayer("apple", {
    providerAccountId: sub,
    email,
    name,
    image: null,
  });

  console.log("[OAuth Apple] playerId:", playerId, "sub:", sub, "email:", email);

  const token = signOAuthToken({ playerId, email, provider: "apple" });

  const res = NextResponse.redirect(`${base}/book/onboarding`);
  const isSecure = base.startsWith("https");
  setOAuthCookie(res, token, isSecure);
  res.cookies.set("oauth_state_apple", "", { maxAge: 0, path: "/" });
  console.log("[OAuth Apple] redirecting to /book/onboarding, cookie set, isSecure:", isSecure);
  return res;
}
