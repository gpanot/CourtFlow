import type { NextRequest, NextResponse } from "next/server";

/** HttpOnly mirror of player JWT so /player can rehydrate when localStorage is empty (e.g. iOS PWA vs in-browser partition). */
export const PLAYER_AUTH_COOKIE = "cf_player_jwt";

const MAX_AGE_SEC = 60 * 60 * 24 * 30; // match JWT (30d)

function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

export function setPlayerAuthCookieOnResponse(res: NextResponse, token: string): void {
  res.cookies.set(PLAYER_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
}

export function clearPlayerAuthCookieOnResponse(res: NextResponse): void {
  res.cookies.set(PLAYER_AUTH_COOKIE, "", {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export function getPlayerTokenFromRequest(request: NextRequest): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return request.cookies.get(PLAYER_AUTH_COOKIE)?.value ?? null;
}
