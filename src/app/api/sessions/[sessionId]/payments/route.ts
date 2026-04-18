import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    requireStaff(request.headers);

    const { sessionId } = await params;
    if (!sessionId?.trim()) return error("sessionId is required", 400);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, venueId: true, openedAt: true, closedAt: true },
    });
    if (!session) return error("Session not found", 404);

    // All confirmed payments that belong to this session:
    // 1. Directly linked by sessionId (self check-in flow)
    // 2. CourtPay payments confirmed during the session window (no sessionId FK)
    const payments = await prisma.pendingPayment.findMany({
      where: {
        venueId: session.venueId,
        status: "confirmed",
        OR: [
          { sessionId: session.id },
          {
            checkInPlayerId: { not: null },
            confirmedAt: {
              gte: session.openedAt,
              ...(session.closedAt ? { lte: session.closedAt } : {}),
            },
          },
        ],
      },
      include: {
        player: { select: { id: true, name: true, skillLevel: true, facePhotoPath: true } },
        checkInPlayer: { select: { id: true, name: true, skillLevel: true } },
      },
      orderBy: { confirmedAt: "desc" },
    });

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    return json({
      payments,
      summary: {
        total: payments.length,
        totalRevenue,
        cash: payments.filter((p) => p.paymentMethod === "cash").length,
        qr: payments.filter((p) => p.paymentMethod !== "cash" && p.type !== "subscription").length,
        subscription: payments.filter((p) => p.type === "subscription").length,
      },
    });
  } catch (e) {
    console.error("[Session Payments]", e);
    return error((e as Error).message, 500);
  }
}
