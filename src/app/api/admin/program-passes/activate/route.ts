import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const body = await parseBody<{
      playerId: string;
      venueId: string;
      passTypeId: string;
      paymentMethod?: string;
      amountValue?: number;
      note?: string;
      cycleStart: string; // ISO date string, e.g. "2026-07-01"
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

    // Cycle dates: start = first of the specified month, end = last day of that month
    const cycleStart = new Date(body.cycleStart + "T12:00:00+07:00");
    cycleStart.setDate(1);
    cycleStart.setHours(0, 0, 0, 0);

    const cycleEnd = new Date(cycleStart.getFullYear(), cycleStart.getMonth() + 1, 0, 23, 59, 59, 999);

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
