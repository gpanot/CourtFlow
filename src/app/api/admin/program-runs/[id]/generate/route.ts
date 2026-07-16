import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { generateRunSchedule, ProgramRunError } from "@/lib/program-run";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { id } = await params;

    const existing = await prisma.programRun.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) return error("Program run not found", 404);

    // Double-generation guard is inside generateRunSchedule (idempotent).
    // We additionally check here to return a clear 409 to the UI.
    const instanceCount = await prisma.classInstance.count({
      where: { programRunId: id },
    });
    if (instanceCount > 0) {
      return error(
        `Schedule already generated (${instanceCount} instances exist). To regenerate, delete existing instances first.`,
        409
      );
    }

    const result = await generateRunSchedule(id);
    return json({ ...result, message: `Schedule generated: ${result.instanceCount} sessions created.` }, 201);
  } catch (e) {
    if (e instanceof ProgramRunError) {
      return error(e.message, 400);
    }
    return error((e as Error).message, 500);
  }
}
