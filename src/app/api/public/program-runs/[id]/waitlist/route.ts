import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/** POST /api/public/program-runs/[id]/waitlist — join the waitlist */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id: runId } = await params;

    const run = await prisma.programRun.findUnique({
      where: { id: runId },
      select: { id: true, maxCapacity: true, _count: { select: { programPasses: true } } },
    });
    if (!run) return error("Program run not found", 404);

    // Already enrolled?
    const pass = await prisma.programPass.findFirst({
      where: { programRunId: runId, playerId, status: "active" },
    });
    if (pass) return error("Already enrolled in this run", 409);

    // Already on waitlist?
    const existing = await prisma.programRunWaitlistEntry.findFirst({
      where: { runId, playerId },
    });
    if (existing) return json({ status: existing.status });

    const entry = await prisma.programRunWaitlistEntry.create({
      data: { runId, playerId, status: "waiting" },
    });

    return json({ id: entry.id, status: entry.status });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}

/** GET /api/public/program-runs/[id]/waitlist — check waitlist status */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id: runId } = await params;

    const entry = await prisma.programRunWaitlistEntry.findFirst({
      where: { runId, playerId },
      select: { status: true, createdAt: true },
    });

    return json({ onWaitlist: !!entry, status: entry?.status ?? null });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
