/**
 * GET /api/auth/callback/google
 * Exchanges the authorization code for tokens, fetches the user profile,
 * finds or creates a Player, issues a player_token cookie, and redirects
 * to /book/onboarding.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  findOrCreateOAuthPlayer,
  signOAuthToken,
  setOAuthCookie,
} from "@/lib/player-oauth";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Base URL for the CourtPass player portal (strips trailing slash). */
function getCourtPassBase(): string {
  return (process.env.NEXT_PUBLIC_COURTPASS_URL ?? "https://courtpass.thecourtflow.com").replace(/\/$/, "");
}

function errorRedirect(base: string, msg: string) {
  // Always send player errors to the CourtPass login page
  const cpBase = getCourtPassBase();
  void base; // callback base kept for redirect_uri calculation only
  return NextResponse.redirect(`${cpBase}/login?error=${encodeURIComponent(msg)}`);
}

export async function GET(req: NextRequest) {
  const base = getBaseUrl(req);
  const { searchParams } = req.nextUrl;

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("oauth_state_google")?.value;

  if (!code) return errorRedirect(base, "No authorization code received");
  if (!state || state !== storedState) return errorRedirect(base, "Invalid OAuth state");

  const redirectUri = `${base}/api/auth/callback/google`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("[Google OAuth] token exchange failed:", err);
    return errorRedirect(base, "Token exchange failed");
  }

  const { access_token } = await tokenRes.json() as { access_token: string };

  // Fetch user profile
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!profileRes.ok) return errorRedirect(base, "Failed to fetch Google profile");

  const profile = await profileRes.json() as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  };

  const playerId = await findOrCreateOAuthPlayer("google", {
    providerAccountId: profile.sub,
    email: profile.email ?? null,
    name: profile.name ?? null,
    image: profile.picture ?? null,
  });

  console.log("[OAuth Google] playerId:", playerId, "email:", profile.email, "sub:", profile.sub);

  const token = signOAuthToken({
    playerId,
    email: profile.email ?? null,
    provider: "google",
  });

  const cpBase = getCourtPassBase();
  const res = NextResponse.redirect(`${cpBase}/onboarding`);
  const isSecure = base.startsWith("https");
  setOAuthCookie(res, token, isSecure);
  // Clear state cookie
  res.cookies.set("oauth_state_google", "", { maxAge: 0, path: "/" });
  console.log("[OAuth Google] redirecting to CourtPass /onboarding, cookie set, isSecure:", isSecure);
  return res;
}
