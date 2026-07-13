import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { computeCycleEnd } from "@/lib/program-pass";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const body = await parseBody<{
      playerId: string;
      venueId: string;
      passTypeId: string;
      paymentMethod?: string;
      amountValue?: number;
      note?: string;
      cycleStart: string; // ISO date string, e.g. "2026-07-01" (for monthly) or "2026-07-13" (for days_N)
      isFree?: boolean;
    }>(request);

    if (!body.playerId) return error("playerId is required");
    if (!body.venueId) return error("venueId is required");
    if (!body.passTypeId) return error("passTypeId is required");
    if (!body.cycleStart) return error("cycleStart is required");

    const passType = await prisma.programPassType.findFirst({
      where: { id: body.passTypeId, venueId: body.venueId, isActive: true },
    });
    if (!passType) return error("Pass type not found or inactive", 404);

    const player = await prisma.player.findUnique({ where: { id: body.playerId } });
    if (!player) return error("Player not found", 404);

    // For monthly passes: align to first of the month.
    // For days_N passes: use the given date as-is (staff picks the exact start day).
    const passMode = passType.passMode;

    let cycleStart: Date;
    if (passMode === "monthly") {
      cycleStart = new Date(body.cycleStart + "T12:00:00+07:00");
      cycleStart.setDate(1);
      cycleStart.setHours(0, 0, 0, 0);
    } else {
      cycleStart = new Date(body.cycleStart + "T00:00:00+07:00");
      cycleStart.setHours(0, 0, 0, 0);
    }

    const cycleEnd = computeCycleEnd(cycleStart, passMode);

    const amountValue = body.isFree ? 0 : (body.amountValue ?? passType.price);

    const result = await prisma.$transaction(async (tx) => {
      const pass = await tx.programPass.create({
        data: {
          playerId: body.playerId,
          venueId: body.venueId,
          passTypeId: body.passTypeId,
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
