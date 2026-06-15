/**
 * GET /api/auth/oauth/google
 * Initiates Google OAuth. Sets a state cookie for CSRF protection, then
 * redirects to Google's authorization endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const base = getBaseUrl(req);
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${base}/api/auth/callback/google`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "online");

  const res = NextResponse.redirect(url.toString());
  // httpOnly state cookie for CSRF validation in callback
  res.cookies.set("oauth_state_google", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 600, // 10 minutes
    path: "/",
  });
  return res;
}
