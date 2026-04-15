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
      select: { id: true },
    });
    if (!session) return json([]);

    await prisma.pendingPayment.updateMany({
      where: {
        sessionId: session.id,
        status: "pending",
        expiresAt: { lt: new Date() },
      },
      data: { status: "expired" },
    });

    const payments = await prisma.pendingPayment.findMany({
      where: { sessionId: session.id, status: "pending" },
      include: { player: { select: { id: true, name: true, skillLevel: true, facePhotoPath: true } } },
      orderBy: { createdAt: "asc" },
    });

    return json(payments);
  } catch (e) {
    console.error("[Staff Pending Payments] Error:", e);
    return error((e as Error).message, 500);
  }
}
