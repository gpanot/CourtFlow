import { NextRequest } from "next/server";
import { comparePassword, signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { phone, password } = await parseBody<{ phone: string; password: string }>(request);
    if (!phone || !password) return error("Phone and password are required");

    const staff = await prisma.staffMember.findUnique({
      where: { phone },
      include: { venues: { select: { id: true, name: true } } },
    });
    if (!staff) return error("Invalid credentials", 401);

    if (!comparePassword(password, staff.passwordHash)) {
      return error("Invalid credentials", 401);
    }

    const firstVenueId = staff.venues.length === 1 ? staff.venues[0].id : undefined;

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
        role: staff.role,
        venues: staff.venues,
        venueId: firstVenueId || null,
        onboardingCompleted: staff.onboardingCompleted,
      },
    });
  } catch (e) {
    console.error("[staff-login]", e);
    return error("Something went wrong. Please try again later.", 500);
  }
}
