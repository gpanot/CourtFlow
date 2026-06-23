/**
 * GET /api/auth/callback/coach-google-calendar
 *
 * Handles the Google OAuth callback for coach calendar access.
 * Exchanges the auth code for tokens, discovers the coach's primary calendar,
 * and stores the refresh_token + calendarId on the StaffMember record.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function getBaseUrl(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

/** Base URL for the CourtPass player portal (strips trailing slash). */
function getCourtPassBase(): string {
  return (process.env.NEXT_PUBLIC_COURTPASS_URL ?? "https://courtpass.thecourtflow.com").replace(/\/$/, "");
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const cookieState = req.cookies.get("oauth_state_coach_calendar")?.value;
  const coachStaffId = req.cookies.get("coach_calendar_staff_id")?.value;

  if (!code || !state || state !== cookieState || !coachStaffId) {
    const cpBase = getCourtPassBase();
    return NextResponse.redirect(`${cpBase}/coach-portal?calendarError=invalid_state`);
  }

  const base = getBaseUrl(req);
  const redirectUri = `${base}/api/auth/callback/coach-google-calendar`;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error("[coach-calendar-callback] Token exchange failed:", await tokenRes.text());
      const cpBase = getCourtPassBase();
      return NextResponse.redirect(`${cpBase}/coach-portal?calendarError=token_exchange`);
    }

    const tokenData = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!tokenData.refresh_token) {
      const cpBase = getCourtPassBase();
      return NextResponse.redirect(`${cpBase}/coach-portal?calendarError=no_refresh_token`);
    }

    // Discover the coach's primary calendar ID
    const calListRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList/primary",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );

    let calendarId = "primary";
    if (calListRes.ok) {
      const calData = (await calListRes.json()) as { id?: string };
      calendarId = calData.id ?? "primary";
    }

    await prisma.staffMember.update({
      where: { id: coachStaffId },
      data: {
        googleRefreshToken: tokenData.refresh_token,
        googleCalendarId: calendarId,
        calendarSyncEnabled: true,
      },
    });

    const cpBase = getCourtPassBase();
    const res = NextResponse.redirect(`${cpBase}/coach-portal?calendarConnected=1`);
    res.cookies.delete("oauth_state_coach_calendar");
    res.cookies.delete("coach_calendar_staff_id");
    return res;
  } catch (e) {
    console.error("[coach-calendar-callback] Error:", e);
    const cpBase = getCourtPassBase();
    return NextResponse.redirect(`${cpBase}/coach-portal?calendarError=server_error`);
  }
}
