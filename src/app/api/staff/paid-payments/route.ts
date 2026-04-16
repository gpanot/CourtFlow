import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId?.trim()) return error("venueId is required", 400);

    const session = await prisma.session.findFirst({
      where: { venueId, status: "open" },
      select: { id: true, sessionFee: true },
    });
    const paymentScope = session
      ? [{ sessionId: session.id }, { checkInPlayerId: { not: null } }]
      : [{ checkInPlayerId: { not: null } }];

    const payments = await prisma.pendingPayment.findMany({
      where: {
        venueId,
        status: "confirmed",
        OR: paymentScope,
      },
      include: {
        player: { select: { id: true, name: true, skillLevel: true, facePhotoPath: true } },
        checkInPlayer: { select: { id: true, name: true, skillLevel: true } },
      },
      orderBy: { confirmedAt: "desc" },
    });

    const playerCount = payments.length;
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

    return json({
      payments,
      summary: { playerCount, totalRevenue },
    });
  } catch (e) {
    console.error("[Staff Paid Payments] Error:", e);
    return error((e as Error).message, 500);
  }
}
