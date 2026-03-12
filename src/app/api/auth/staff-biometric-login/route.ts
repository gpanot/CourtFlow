import { NextRequest } from "next/server";
import { signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    const { staffId } = await parseBody<{ staffId: string }>(request);
    if (!staffId) return error("Staff ID is required");

    const staff = await prisma.staffMember.findUnique({
      where: { id: staffId },
      include: { venues: { select: { id: true, name: true } } },
    });
    if (!staff) return error("Staff not found", 404);

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
    console.error("[staff-biometric-login]", e);
    return error("Something went wrong. Please try again later.", 500);
  }
}
