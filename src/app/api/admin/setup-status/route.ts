import { NextRequest } from "next/server";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);

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
    const msg = (e as Error).message;
    if (msg.includes("authorization") || msg.includes("token") || msg.includes("access required")) {
      return error(msg, 401);
    }
    return error(msg, 500);
  }
}
