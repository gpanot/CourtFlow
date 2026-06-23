/**
 * GET /api/auth/coach-google-calendar/staff-init
 *
 * Staff-JWT-authenticated endpoint that returns the Google OAuth URL as JSON
 * and sets the required httpOnly cookies (state + coachStaffId) for the callback.
 *
 * Used by the admin coach portal "Connect Google Calendar" button, which cannot
 * send Authorization headers via browser navigation.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { requireStaff } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  let auth;
  try {
    auth = requireStaff(req.headers);
  } catch {
    return error("Authentication required", 401);
  }

  const staffMember = await prisma.staffMember.findUnique({
    where: { id: auth.id, isCoach: true },
    select: { id: true },
  });

  if (!staffMember) {
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

  const res = NextResponse.json({ url: url.toString() });
  res.cookies.set("oauth_state_coach_calendar", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  res.cookies.set("coach_calendar_staff_id", staffMember.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  return res;
}
