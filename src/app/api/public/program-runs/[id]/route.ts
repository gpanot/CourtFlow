import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let playerId: string | null = null;
    try {
      const { playerId: pid } = await requirePortalAuth(request);
      playerId = pid;
    } catch {
      // unauthenticated browse is fine
    }

    const run = await prisma.programRun.findUnique({
      where: { id },
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
            prerequisites: true,
            description: true,
          },
        },
        coaches: {
          include: {
            coach: { select: { id: true, name: true, coachPhoto: true } },
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
      _count: { select: { programPasses: true } },
      },
    });

    if (!run) return error("Program run not found", 404);

    // Player-specific status
    let isEnrolled = false;
    let isWaitlisted = false;
    let programPassId: string | null = null;

    if (playerId) {
      const pass = await prisma.programPass.findFirst({
        where: { programRunId: id, playerId, status: "active" },
        select: { id: true },
      });
      isEnrolled = !!pass;
      programPassId = pass?.id ?? null;

      if (!isEnrolled) {
        const waitlist = await prisma.programRunWaitlistEntry.findFirst({
          where: { runId: id, playerId },
          select: { status: true },
        });
        isWaitlisted = waitlist?.status === "waiting";
      }
    }

    return json({
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
      isEnrolled,
      isWaitlisted,
      programPassId,
      passType: run.passType,
      coaches: run.coaches.map((c) => ({
        id: c.coach.id,
        name: c.coach.name,
        photo: c.coach.coachPhoto,
      })),
      instances: run.classInstances,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
