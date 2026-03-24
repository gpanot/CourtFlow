import { NextResponse } from "next/server";
import { clearPlayerAuthCookieOnResponse } from "@/lib/player-auth-cookie";

/** Clears the httpOnly player session cookie (localStorage is cleared client-side). */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  clearPlayerAuthCookieOnResponse(res);
  return res;
}
