import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/program-passes/activate
 *
 * Admin-only: manually enroll a player in a program run.
 * cycle boundaries are derived from the run's actual dates — no billing-cycle
 * math is required since runs define the full date range.
 */
export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const body = await parseBody<{
      playerId: string;
      venueId: string;
      passTypeId: string;
      programRunId?: string;
      paymentMethod?: string;
      amountValue?: number;
      note?: string;
      isFree?: boolean;
    }>(request);

    if (!body.playerId) return error("playerId is required");
    if (!body.venueId) return error("venueId is required");
    if (!body.passTypeId) return error("passTypeId is required");

    const passType = await prisma.programPassType.findFirst({
      where: { id: body.passTypeId, venueId: body.venueId, isActive: true },
    });
    if (!passType) return error("Pass type not found or inactive", 404);

    const player = await prisma.player.findUnique({ where: { id: body.playerId } });
    if (!player) return error("Player not found", 404);

    // Resolve cycle boundaries from the run (if provided) or use a wide default.
    let cycleStart: Date;
    let cycleEnd: Date;

    if (body.programRunId) {
      const run = await prisma.programRun.findUnique({
        where: { id: body.programRunId },
        select: {
          startDate: true,
          classInstances: {
            orderBy: { endAt: "desc" },
            take: 1,
            select: { endAt: true },
          },
        },
      });
      if (!run) return error("Program run not found", 404);

      // Local-noon start to avoid Prisma @db.Date drift (Asia/Saigon = UTC+7).
      const startKey = run.startDate.toISOString().slice(0, 10);
      cycleStart = new Date(`${startKey}T12:00:00+07:00`);
      cycleStart.setHours(0, 0, 0, 0);

      const lastInstance = run.classInstances[0];
      cycleEnd = lastInstance
        ? new Date(lastInstance.endAt)
        : (() => { const d = new Date(cycleStart); d.setFullYear(d.getFullYear() + 1); return d; })();
    } else {
      // No run — use today as start, +1 year as end (admin knows what they're doing).
      cycleStart = new Date();
      cycleStart.setHours(0, 0, 0, 0);
      cycleEnd = new Date(cycleStart);
      cycleEnd.setFullYear(cycleEnd.getFullYear() + 1);
    }

    const amountValue = body.isFree ? 0 : (body.amountValue ?? passType.price);

    const result = await prisma.$transaction(async (tx) => {
      const pass = await tx.programPass.create({
        data: {
          playerId: body.playerId,
          venueId: body.venueId,
          passTypeId: body.passTypeId,
          programRunId: body.programRunId ?? null,
          status: "active",
          cycleStart,
          cycleEnd,
          sessionsUsed: 0,
        },
      });

      const payment = await tx.programPassPayment.create({
        data: {
          programPassId: pass.id,
          periodStart: cycleStart,
          periodEnd: cycleEnd,
          amountValue,
          status: body.paymentMethod && !body.isFree ? "PAID" : "UNPAID",
          paymentMethod: body.paymentMethod ?? null,
          note: body.note ?? null,
          paidAt: body.paymentMethod && !body.isFree ? new Date() : null,
        },
      });

      return { pass, payment };
    });

    return json(result, 201);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
