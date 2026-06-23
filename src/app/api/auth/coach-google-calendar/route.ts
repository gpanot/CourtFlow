/**
 * GET /api/auth/coach-google-calendar
 *
 * Initiates Google OAuth for coach calendar access.
 * Requires the player to be logged in as a coach (coachStaffId must be set).
 * Requests offline access with calendar.events scope so we get a refresh token.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requirePortalAuth } from "@/lib/portal-auth";
import { prisma } from "@/lib/db";
import { error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  try {
    const { playerId, coachStaffId } = await requirePortalAuth(req);

    if (!coachStaffId) {
      return error("Not a coach account", 403);
    }

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { coachStaffId: true },
    });

    if (!player?.coachStaffId) {
      return error("Not a coach account", 403);
    }

    const state = crypto.randomBytes(16).toString("hex");
    const base = getBaseUrl(req);
    const redirectUri = `${base}/api/auth/callback/coach-google-calendar`;

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events");
    url.searchParams.set("state", state);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    const res = NextResponse.redirect(url.toString());
    res.cookies.set("oauth_state_coach_calendar", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });
    // Store coachStaffId in cookie so the callback can identify which coach to update
    res.cookies.set("coach_calendar_staff_id", coachStaffId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 600,
      path: "/",
    });

    return res;
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
