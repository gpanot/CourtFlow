import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { resolveVenueId } from "@/lib/venue-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const venueId = resolveVenueId(request);

    const coaches = await prisma.staffMember.findMany({
      where: {
        isCoach: true,
        venueAssignments: { some: { venueId } },
      },
      select: {
        id: true,
        name: true,
        coachBio: true,
        coachPhoto: true,
        coachPackages: {
          where: { venueId, active: true },
          select: {
            id: true,
            name: true,
            priceInCents: true,
            durationMin: true,
            lessonType: true,
            sessionsIncluded: true,
          },
          orderBy: { sortOrder: "asc" },
        },
        _count: {
          select: {
            coachLessons: {
              where: { venueId, status: { in: ["confirmed", "completed"] } },
            },
          },
        },
      },
    });

    const result = coaches.map((c) => ({
      id: c.id,
      name: c.name,
      coachBio: c.coachBio,
      coachPhoto: c.coachPhoto,
      packages: c.coachPackages,
      sessionsCompleted: c._count.coachLessons,
      startingPrice: c.coachPackages.length > 0
        ? Math.min(...c.coachPackages.map((p) => p.priceInCents))
        : 0,
    }));

    return json(result);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
