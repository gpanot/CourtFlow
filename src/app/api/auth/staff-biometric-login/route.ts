import { NextRequest } from "next/server";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { staffAssignmentsToVenues } from "@/lib/staff-app-access";
import { extractClientIp, resolveIpGeo } from "@/lib/resolve-ip-geo";

function logAuth(
  staffId: string | null,
  phone: string | null,
  ip: string | null,
  userAgent: string | null,
) {
  resolveIpGeo(ip).then((geo) => {
    prisma.staffAuthLog
      .create({
        data: {
          staffId,
          action: "biometric_login",
          phone,
          ipAddress: ip,
          country: geo.country,
          city: geo.city,
          userAgent,
        },
      })
      .catch((err) => console.error("[staff-auth-log]", err));
  });
}

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    const { staffId } = await parseBody<{ staffId: string }>(request);
    if (!staffId) return error("Staff ID is required");

    const ip = extractClientIp(request.headers);
    const userAgent = request.headers.get("user-agent");

    const staff = await prisma.staffMember.findUnique({
      where: { id: staffId },
      include: {
        venueAssignments: {
          include: { venue: { select: { id: true, name: true } } },
        },
      },
    });
    if (!staff) return error("Staff not found", 404);

    logAuth(staff.id, staff.phone, ip, userAgent);

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
    console.error("[staff-biometric-login]", e);
    return error("Something went wrong. Please try again later.", 500);
  }
}
