import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get("venueId");
    const enrolledOnly = searchParams.get("enrolled") === "true";
    if (!venueId) return error("venueId required", 400);

    // Optionally get the current player (auth not required for browse)
    let playerId: string | null = null;
    try {
      const { playerId: pid } = await requirePortalAuth(request);
      playerId = pid;
    } catch {
      // unauthenticated browse is fine
    }

    if (enrolledOnly) {
      if (!playerId) return error("Authentication required", 401);
      const passes = await prisma.programPass.findMany({
        where: {
          venueId,
          playerId,
          programRunId: { not: null },
          status: "active",
        },
        include: {
          programRun: {
            include: {
              passType: {
                select: {
                  id: true,
                  name: true,
                  imageUrl: true,
                  price: true,
                  sessionsIncluded: true,
                  level: true,
                  ageRange: true,
                },
              },
              coaches: {
                include: {
                  coach: { select: { name: true, coachPhoto: true } },
                },
              },
              classInstances: {
                orderBy: { startAt: "asc" },
                select: {
                  id: true,
                  startAt: true,
                  endAt: true,
                  topic: true,
                },
              },
            },
          },
        },
      });

      // Re-fetch with correct programPassId for check-in filtering
      const result = await Promise.all(
        passes.map(async (pass) => {
          if (!pass.programRun) return null;
          const checkInCount = await prisma.classCheckIn.count({
            where: { programPassId: pass.id },
          });
          const run = pass.programRun;
          const classInstances = await prisma.classInstance.findMany({
            where: { programRunId: run.id },
            orderBy: { startAt: "asc" },
            select: {
              id: true,
              startAt: true,
              endAt: true,
              topic: true,
              checkIns: {
                where: { programPassId: pass.id },
                select: { id: true },
              },
            },
          });
          return {
            programPassId: pass.id,
            run: {
              id: run.id,
              name: run.name,
              status: run.status,
              maxCapacity: run.maxCapacity,
              recurrenceStartHour: run.recurrenceStartHour,
              recurrenceDurationMin: run.recurrenceDurationMin,
              passType: run.passType,
              coaches: run.coaches.map((c) => ({ name: c.coach.name, photo: c.coach.coachPhoto })),
              instances: classInstances,
            },
            checkInCount,
            totalSessions: classInstances.length,
          };
        })
      );

      return json(result.filter(Boolean));
    }

    // Public browse: list upcoming + in_progress runs with enrollment counts
    const runs = await prisma.programRun.findMany({
      where: {
        venueId,
        status: { in: ["upcoming", "in_progress"] },
        passType: { isActive: true },
      },
      orderBy: { startDate: "asc" },
      include: {
        passType: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            price: true,
            sessionsIncluded: true,
            level: true,
            ageRange: true,
            skillTags: true,
            description: true,
          },
        },
        coaches: {
          include: {
            coach: { select: { name: true, coachPhoto: true } },
          },
        },
        _count: { select: { programPasses: true } },
      },
    });

    // Get enrollment status for the current player
    const enrolledRunIds = playerId
      ? (
          await prisma.programPass.findMany({
            where: { venueId, playerId, programRunId: { not: null }, status: "active" },
            select: { programRunId: true },
          })
        ).map((p) => p.programRunId as string)
      : [];

    const waitlistedRunIds = playerId
      ? (
          await prisma.programRunWaitlistEntry.findMany({
            where: { runId: { in: runs.map((r) => r.id) }, playerId, status: "waiting" },
            select: { runId: true },
          })
        ).map((w) => w.runId)
      : [];

    const result = runs.map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      startDate: run.startDate,
      recurrenceStartHour: run.recurrenceStartHour,
      recurrenceDurationMin: run.recurrenceDurationMin,
      recurrenceCount: run.recurrenceCount,
      maxCapacity: run.maxCapacity,
      enrolledCount: run._count.programPasses,
      isFull: run._count.programPasses >= run.maxCapacity,
      isEnrolled: enrolledRunIds.includes(run.id),
      isWaitlisted: waitlistedRunIds.includes(run.id),
      passType: run.passType,
      coaches: run.coaches.map((c) => ({ name: c.coach.name, photo: c.coach.coachPhoto })),
    }));

    return json(result);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
