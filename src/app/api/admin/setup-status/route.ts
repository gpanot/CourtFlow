import { NextRequest } from "next/server";
import { requireSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    const auth = requireSuperAdmin(request.headers);

    const ownedVenues = await prisma.venue.findMany({
      where: { staffAssignments: { some: { staffId: auth.id } } },
      select: { id: true },
    });
    const ownedVenueIds = ownedVenues.map((v) => v.id);
    const hasVenue = ownedVenueIds.length > 0;

    const staffCount =
      ownedVenueIds.length === 0
        ? 0
        : await prisma.staffMember.count({
            where: {
              role: "staff",
              venueAssignments: { some: { venueId: { in: ownedVenueIds } } },
            },
          });
    const hasStaff = staffCount > 0;

    const staffWithVenue =
      ownedVenueIds.length === 0
        ? 0
        : await prisma.staffMember.count({
            where: {
              role: "staff",
              venueAssignments: { some: { venueId: { in: ownedVenueIds } } },
            },
          });
    const staffAssignedToVenue = staffWithVenue > 0;

    return json({ hasVenue, hasStaff, staffAssignedToVenue });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
