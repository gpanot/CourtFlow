import { NextRequest } from "next/server";
import { requireStaff, signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { staffAssignmentsToVenues } from "@/lib/staff-app-access";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/staff-refresh
 *
 * Re-issues a fresh JWT with the current role from the DB.
 * Used when a staff member's role is promoted (e.g. staff → manager)
 * without requiring a full logout/login cycle.
 *
 * Requires a valid existing Bearer token (any staff role).
 */
export async function POST(request: NextRequest) {
  try {
    const payload = requireStaff(request.headers);

    const staff = await prisma.staffMember.findUnique({
      where: { id: payload.id },
      include: {
        venueAssignments: {
          include: { venue: { select: { id: true, name: true } } },
        },
      },
    });

    if (!staff) return error("Staff not found", 404);

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
    const msg = (e as Error).message;
    if (msg === "Missing authorization token" || msg === "Invalid or expired token") {
      return error(msg, 401);
    }
    if (msg === "Staff access required") return error(msg, 403);
    return error("Something went wrong", 500);
  }
}
