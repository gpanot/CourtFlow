import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");

    const coaches = await prisma.staffMember.findMany({
      where: {
        isCoach: true,
        ...(venueId ? { venues: { some: { id: venueId } } } : {}),
      },
      include: {
        venues: { select: { id: true, name: true } },
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
        venues: c.venues,
        packages: c.coachPackages,
        lessonCount: c._count.coachLessons,
      }))
    );
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
