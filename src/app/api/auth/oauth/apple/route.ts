/**
 * GET /api/auth/oauth/apple
 * Initiates Apple Sign-In. Sets a state cookie then redirects to Apple's
 * authorization endpoint. Apple will POST back to /api/auth/callback/apple
 * with an id_token — no code exchange required.
 *
 * Env vars required:
 *   APPLE_CLIENT_ID — Services ID, e.g. com.courtflow.web
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const APPLE_CLIENT_ID = process.env.APPLE_CLIENT_ID!;

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const base = getBaseUrl(req);
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${base}/api/auth/callback/apple`;

  const url = new URL("https://appleid.apple.com/auth/authorize");
  url.searchParams.set("client_id", APPLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code id_token");
  url.searchParams.set("scope", "name email");
  url.searchParams.set("response_mode", "form_post");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  // SameSite=None is required because Apple form_post is cross-site.
  res.cookies.set("oauth_state_apple", state, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    maxAge: 600,
    path: "/",
  });
  return res;
}
