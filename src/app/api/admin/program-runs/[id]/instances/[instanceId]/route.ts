import { NextRequest } from "next/server";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { rescheduleInstance, deleteAndReplaceInstance, ProgramRunError } from "@/lib/program-run";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { instanceId } = await params;

    const result = await deleteAndReplaceInstance(instanceId);
    return json(result);
  } catch (e) {
    if (e instanceof ProgramRunError) {
      return error(e.message, e.code === "INSTANCE_HAS_CHECKINS" ? 409 : 400);
    }
    return error((e as Error).message, 500);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; instanceId: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { instanceId } = await params;

    const { id: runId } = await params;

    const body = await parseBody<{
      // Reschedule fields
      newDate?: string;        // "YYYY-MM-DD"
      newStartTime?: string;   // ISO datetime string
      newEndTime?: string;     // ISO datetime string
      // Session topic label
      topic?: string | null;
      // Coach override for this instance's block
      coachIds?: string[];
      /** When true, also apply coachIds to all future instances in the same run */
      applyToFuture?: boolean;
    }>(request);

    const instance = await prisma.classInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, courtBlockId: true, startAt: true },
    });
    if (!instance) return error("Class instance not found", 404);

    // Update topic label if provided
    if ("topic" in body) {
      await prisma.classInstance.update({
        where: { id: instanceId },
        data: { topic: body.topic ?? null },
      });
    }

    // Reschedule the date/time if provided
    if (body.newDate && body.newStartTime && body.newEndTime) {
      await rescheduleInstance(
        instanceId,
        body.newDate,
        new Date(body.newStartTime),
        new Date(body.newEndTime)
      );
    }

    // Replace per-block coaches if provided
    if (body.coachIds !== undefined) {
      // Collect block IDs to update — start with this instance's block
      const blockIds: string[] = [];
      if (instance.courtBlockId) blockIds.push(instance.courtBlockId);

      // If applyToFuture, gather all future instances in this run
      if (body.applyToFuture) {
        const futureInstances = await prisma.classInstance.findMany({
          where: {
            programRunId: runId,
            id: { not: instanceId },
            startAt: { gte: instance.startAt },
          },
          select: { courtBlockId: true },
        });
        for (const fi of futureInstances) {
          if (fi.courtBlockId) blockIds.push(fi.courtBlockId);
        }
      }

      // Apply coach changes to all collected blocks in a transaction
      if (blockIds.length > 0) {
        const coachRows: Prisma.CourtBlockCoachCreateManyInput[] = body.coachIds.flatMap((coachId) =>
          blockIds.map((courtBlockId) => ({ courtBlockId, coachId }))
        );
        await prisma.$transaction([
          prisma.courtBlockCoach.deleteMany({ where: { courtBlockId: { in: blockIds } } }),
          ...(coachRows.length > 0
            ? [prisma.courtBlockCoach.createMany({ data: coachRows, skipDuplicates: true })]
            : []),
        ]);
      }
    }

    const result = await prisma.classInstance.findUnique({
      where: { id: instanceId },
      select: {
        id: true,
        topic: true,
        startAt: true,
        endAt: true,
        programRunId: true,
        courtBlockId: true,
        courtBlock: {
          select: {
            id: true,
            date: true,
            startTime: true,
            endTime: true,
            courtIds: true,
            courtBlockCoaches: {
              include: { coach: { select: { id: true, name: true } } },
            },
          },
        },
        _count: { select: { checkIns: true } },
      },
    });

    return json(result);
  } catch (e) {
    if (e instanceof ProgramRunError) {
      return error(e.message, 400);
    }
    return error((e as Error).message, 500);
  }
}
