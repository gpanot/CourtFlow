/**
 * ONE-SHOT endpoint — seeds default availability for any coach with zero rows.
 * DELETE THIS FILE immediately after running once in production.
 */
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);

    const coaches = await prisma.staffMember.findMany({
      where: { isCoach: true },
      select: {
        id: true,
        name: true,
        _count: { select: { coachAvailabilities: true } },
      },
    });

    const seeded: string[] = [];

    for (const coach of coaches) {
      if (coach._count.coachAvailabilities === 0) {
        await prisma.coachAvailability.createMany({
          data: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
            coachId: coach.id,
            dayOfWeek: day,
            startTime: "08:00",
            endTime: "20:00",
            enabled: true,
          })),
          skipDuplicates: true,
        });
        seeded.push(coach.name);
      }
    }

    return json({ seeded, total: coaches.length });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
