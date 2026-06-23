/**
 * GET /api/auth/coach-google-calendar
 *
 * Initiates Google OAuth for coach calendar access.
 *
 * Supports two auth paths:
 *  1. Staff JWT (Authorization: Bearer <staff_token>) — used by the admin coach portal.
 *     The staff member must have isCoach: true.
 *  2. Player token (Authorization: Bearer <player_token> or player_token cookie) — legacy
 *     path from CourtPass player portal. Requires the player's coachStaffId to be set.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requirePortalAuth } from "@/lib/portal-auth";
import { verifyToken } from "@/lib/auth";
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
    let resolvedCoachStaffId: string | null = null;

    // Path 1: try staff JWT first (admin coach portal)
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const payload = verifyToken(authHeader.slice(7));
      if (payload?.id && (payload.role === "staff" || payload.role === "manager" || payload.role === "superadmin")) {
        const staffMember = await prisma.staffMember.findUnique({
          where: { id: payload.id, isCoach: true },
          select: { id: true },
        });
        if (staffMember) {
          resolvedCoachStaffId = staffMember.id;
        }
      }
    }

    // Path 2: player token fallback (CourtPass portal)
    if (!resolvedCoachStaffId) {
      const { coachStaffId } = await requirePortalAuth(req);
      if (!coachStaffId) {
        return error("Not a coach account", 403);
      }
      resolvedCoachStaffId = coachStaffId;
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
    res.cookies.set("coach_calendar_staff_id", resolvedCoachStaffId, {
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
