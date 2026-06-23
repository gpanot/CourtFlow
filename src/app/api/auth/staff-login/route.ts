import { NextRequest } from "next/server";
import { comparePassword, signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { staffAssignmentsToVenues } from "@/lib/staff-app-access";
import { extractClientIp, resolveIpGeo } from "@/lib/resolve-ip-geo";
import { isRateLimitedCheck, recordRateLimitHit } from "@/lib/rate-limit";

interface FingerprintData {
  fingerprintId: string | null;
  fingerprintConfidence: number | null;
  isVpn: boolean | null;
  isThreat: boolean | null;
}

async function resolveFingerprintData(fingerprint: string | null): Promise<FingerprintData> {
  const apiKey = process.env.THUMBMARKJS_API_KEY;
  if (!fingerprint || !apiKey) {
    return { fingerprintId: fingerprint ?? null, fingerprintConfidence: null, isVpn: null, isThreat: null };
  }
  try {
    const res = await fetch(`https://api.thumbmarkjs.com/v1/fingerprint/${fingerprint}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { fingerprintId: fingerprint, fingerprintConfidence: null, isVpn: null, isThreat: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    return {
      fingerprintId: fingerprint,
      fingerprintConfidence: typeof data.confidence === "number" ? data.confidence : null,
      isVpn: typeof data.vpn === "boolean" ? data.vpn : (data.is_vpn ?? null),
      isThreat: typeof data.threat === "boolean" ? data.threat : (data.threat_level != null ? data.threat_level > 0 : null),
    };
  } catch {
    return { fingerprintId: fingerprint, fingerprintConfidence: null, isVpn: null, isThreat: null };
  }
}

async function logAuth(
  staffId: string | null,
  action: string,
  phone: string | null,
  ip: string | null,
  userAgent: string | null,
  fpData?: FingerprintData,
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
        fingerprintId: fpData?.fingerprintId ?? null,
        fingerprintConfidence: fpData?.fingerprintConfidence ?? null,
        isVpn: fpData?.isVpn ?? null,
        isThreat: fpData?.isThreat ?? null,
      },
    });
  } catch (err) {
    console.error("[staff-auth-log]", err);
  }
}

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const { phone, password, fingerprint } = await parseBody<{ phone: string; password: string; fingerprint?: string }>(request);
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

    // Resolve fingerprint data (non-blocking — best effort)
    const fpData = await resolveFingerprintData(fingerprint ?? null);

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
      await logAuth(null, "login_failed", phone, ip, userAgent, fpData);
      return error("Invalid credentials", 401);
    }

    if (!comparePassword(password, staff.passwordHash)) {
      recordRateLimitHit(ipKey, WINDOW);
      recordRateLimitHit(phoneKey, WINDOW);
      await logAuth(staff.id, "login_failed", phone, ip, userAgent, fpData);
      return error("Invalid credentials", 401);
    }

    await logAuth(staff.id, "login_success", phone, ip, userAgent, fpData);

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
        isCoach: staff.isCoach,
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
