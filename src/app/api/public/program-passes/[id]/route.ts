import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/public/program-passes/[id]
 * Polling endpoint for the pay page — returns payment status so the client
 * can detect when Sepay auto-confirms.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id } = await params;

    const pass = await prisma.programPass.findFirst({
      where: { id, playerId },
      include: {
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, paymentRef: true, amountValue: true, paidAt: true },
        },
        programRun: {
          select: {
            id: true,
            name: true,
            classInstances: {
              orderBy: { startAt: "asc" },
              take: 1,
              select: { startAt: true, topic: true },
            },
          },
        },
      },
    });

    if (!pass) return error("Program pass not found", 404);

    const latestPayment = pass.payments[0] ?? null;
    const nextSession = pass.programRun?.classInstances[0] ?? null;

    return json({
      id: pass.id,
      status: pass.status,
      paymentStatus: latestPayment?.status ?? null,
      paymentRef: latestPayment?.paymentRef ?? null,
      amountValue: latestPayment?.amountValue ?? null,
      paidAt: latestPayment?.paidAt ?? null,
      runId: pass.programRunId,
      runName: pass.programRun?.name ?? null,
      nextSession,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
