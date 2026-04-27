import { NextRequest } from "next/server";
import { comparePassword, signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { staffAssignmentsToVenues } from "@/lib/staff-app-access";

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await parseBody<{ phone: string; password: string }>(request);
    if (!phone || !password) return error("Phone and password are required");

    const staff = await prisma.staffMember.findUnique({
      where: { phone },
      include: {
        venueAssignments: {
          include: { venue: { select: { id: true, name: true } } },
        },
      },
    });
    if (!staff) return error("Invalid credentials", 401);

    if (!comparePassword(password, staff.passwordHash)) {
      return error("Invalid credentials", 401);
    }

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
