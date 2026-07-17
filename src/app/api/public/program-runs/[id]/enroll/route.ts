import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requirePortalAuth } from "@/lib/portal-auth";
import { enrollInRun, ProgramRunError } from "@/lib/program-run";
import { generatePaymentRef } from "@/modules/courtpay/lib/payment-reference";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { playerId } = await requirePortalAuth(request);
    const { id: runId } = await params;

    // Fetch the run to get price and venue
    const run = await prisma.programRun.findUnique({
      where: { id: runId },
      include: {
        passType: { select: { price: true } },
        venue: { select: { id: true } },
      },
    });
    if (!run) return error("Program run not found", 404);

    const amountValue = run.passType.price;
    const venueId = run.venue.id;

    // Generate a payment ref before the transaction
    const paymentRef = await generatePaymentRef("program-pass");

    const result = await enrollInRun({
      runId,
      playerId,
      venueId,
      amountValue,
      paymentRef,
      paymentStatus: "UNPAID",
    });

    return json({
      programPassId: result.programPassId,
      paymentId: result.paymentId,
      paymentRef: result.paymentRef,
      priceValue: amountValue,
      enrolledCount: result.enrolledCount,
      maxCapacity: result.maxCapacity,
    });
  } catch (e) {
    if (e instanceof ProgramRunError) {
      const statusMap: Record<string, number> = {
        RUN_NOT_FOUND: 404,
        RUN_FULL: 409,
        ALREADY_ENROLLED: 409,
        RUN_NOT_UPCOMING: 400,
        TRANSACTION_CONFLICT: 409,
      };
      return error(e.message, statusMap[e.code] ?? 400);
    }
    const msg = (e as Error).message;
    if (msg === "Authentication required") return error(msg, 401);
    return error(msg, 500);
  }
}
