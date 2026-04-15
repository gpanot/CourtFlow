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
    if (!session) return json({ payments: [], summary: { playerCount: 0, totalRevenue: 0 } });

    const payments = await prisma.pendingPayment.findMany({
      where: { sessionId: session.id, status: "confirmed" },
      include: {
        player: { select: { id: true, name: true, skillLevel: true, facePhotoPath: true } },
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
