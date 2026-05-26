import { NextRequest } from "next/server";
import { comparePassword, signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { staffAssignmentsToVenues } from "@/lib/staff-app-access";
import { extractClientIp, resolveIpGeo } from "@/lib/resolve-ip-geo";
import { isRateLimitedCheck, recordRateLimitHit } from "@/lib/rate-limit";

async function logAuth(
  staffId: string | null,
  action: string,
  phone: string | null,
  ip: string | null,
  userAgent: string | null,
) {
  try {
    const geo = await resolveIpGeo(ip);
    await prisma.staffAuthLog.create({
      data: {
        staffId,
        action,
        phone,
        ipAddress: ip,
        country: geo.country,
        city: geo.city,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[staff-auth-log]", err);
  }
}

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await parseBody<{ phone: string; password: string }>(request);
    if (!phone || !password) return error("Phone and password are required");

    const ip = extractClientIp(request.headers);
    const userAgent = request.headers.get("user-agent");

    // Rate-limit by IP (5 failures / 10 min) and by phone (10 failures / 10 min).
    // We check BEFORE the DB lookup so locked-out IPs don't even reach the DB.
    const WINDOW = 10 * 60 * 1000;
    const ipKey = `staff-login-ip:${ip ?? "unknown"}`;
    const phoneKey = `staff-login-phone:${phone}`;
    if (isRateLimitedCheck(ipKey, 5, WINDOW) || isRateLimitedCheck(phoneKey, 10, WINDOW)) {
      await logAuth(null, "login_rate_limited", phone, ip, userAgent);
      return error("Too many login attempts. Please wait 10 minutes before trying again.", 429);
    }

    const staff = await prisma.staffMember.findUnique({
      where: { phone },
      include: {
        venueAssignments: {
          include: { venue: { select: { id: true, name: true } } },
        },
      },
    });

    if (!staff) {
      recordRateLimitHit(ipKey, WINDOW);
      recordRateLimitHit(phoneKey, WINDOW);
      await logAuth(null, "login_failed", phone, ip, userAgent);
      return error("Invalid credentials", 401);
    }

    if (!comparePassword(password, staff.passwordHash)) {
      recordRateLimitHit(ipKey, WINDOW);
      recordRateLimitHit(phoneKey, WINDOW);
      await logAuth(staff.id, "login_failed", phone, ip, userAgent);
      return error("Invalid credentials", 401);
    }

    await logAuth(staff.id, "login_success", phone, ip, userAgent);

    const venues = staffAssignmentsToVenues(staff.venueAssignments);
    const firstVenueId = venues.length === 1 ? venues[0].id : undefined;

    const token = signToken({
      id: staff.id,
      role: staff.role,
      venueId: firstVenueId,
    });

    return json({
      token,
      staff: {
        id: staff.id,
        name: staff.name,
        phone: staff.phone,
        role: staff.role,
        venues,
        venueId: firstVenueId || null,
        onboardingCompleted: staff.onboardingCompleted,
      },
    });
  } catch (e) {
    console.error("[staff-login]", e);
    return error("Something went wrong. Please try again later.", 500);
  }
}
