import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { updateRunCapacity, ProgramRunError } from "@/lib/program-run";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;
    const body = await parseBody<{
      name?: string;
      status?: string;
      maxCapacity?: number;
      note?: string;
      coachIds?: string[];
    }>(request);

    const existing = await prisma.programRun.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return error("Program run not found", 404);

    const validStatuses = ["upcoming", "in_progress", "completed", "cancelled"];
    if (body.status !== undefined && !validStatuses.includes(body.status)) {
      return error(`status must be one of: ${validStatuses.join(", ")}`, 400);
    }

    // Capacity change — use domain function to enforce enrolled-count guard
    if (body.maxCapacity !== undefined) {
      await updateRunCapacity(id, body.maxCapacity);
    }

    await prisma.programRun.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.note !== undefined && { note: body.note ?? null }),
      },
    });

    // Replace coach list if provided
    if (body.coachIds !== undefined) {
      await prisma.programRunCoach.deleteMany({ where: { runId: id } });
      if (body.coachIds.length > 0) {
        await prisma.programRunCoach.createMany({
          data: body.coachIds.map((coachId) => ({ runId: id, coachId })),
          skipDuplicates: true,
        });
      }
    }

    const result = await prisma.programRun.findUnique({
      where: { id },
      include: {
        passType: { select: { id: true, name: true } },
        court: { select: { id: true, label: true } },
        coaches: { include: { coach: { select: { id: true, name: true } } } },
        _count: { select: { programPasses: true, classInstances: true } },
      },
    });

    return json(result);
  } catch (e) {
    if (e instanceof ProgramRunError && e.code === "CAPACITY_BELOW_ENROLLED") {
      return error(e.message, 400);
    }
    return error((e as Error).message, 500);
  }
}
