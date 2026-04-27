import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { staffAssignmentsToVenues } from "@/lib/staff-app-access";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");

    const coaches = await prisma.staffMember.findMany({
      where: {
        isCoach: true,
        ...(venueId ? { venueAssignments: { some: { venueId } } } : {}),
      },
      include: {
        venueAssignments: {
          include: { venue: { select: { id: true, name: true } } },
        },
        coachPackages: {
          where: { active: true },
          orderBy: { sortOrder: "asc" },
        },
        _count: { select: { coachLessons: true } },
      },
      orderBy: { name: "asc" },
    });

    return json(
      coaches.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        coachBio: c.coachBio,
        coachPhoto: c.coachPhoto,
        venues: staffAssignmentsToVenues(c.venueAssignments),
        packages: c.coachPackages,
        lessonCount: c._count.coachLessons,
      }))
    );
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
