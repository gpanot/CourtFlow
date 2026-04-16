import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    requireSuperAdmin(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId");
    const status = searchParams.get("status");
    const days = parseInt(searchParams.get("days") || "30", 10);

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: Record<string, unknown> = {
      checkInPlayerId: { not: null },
      createdAt: { gte: since },
    };
    if (venueId) where.venueId = venueId;
    if (status) where.status = status;

    const payments = await prisma.pendingPayment.findMany({
      where,
      include: {
        checkInPlayer: true,
        venue: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const confirmedFilter = {
      ...where,
      status: "confirmed",
      confirmedAt: { gte: monthStart },
    };

    const monthTotal = await prisma.pendingPayment.aggregate({
      where: confirmedFilter,
      _sum: { amount: true },
      _count: true,
    });

    const pendingCount = await prisma.pendingPayment.count({
      where: { ...where, status: "pending" },
    });

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        venueName: p.venue.name,
        venueId: p.venueId,
        playerName: p.checkInPlayer?.name || "Unknown",
        playerPhone: p.checkInPlayer?.phone || "",
        amount: p.amount,
        type: p.type,
        status: p.status,
        paymentMethod: p.paymentMethod,
        paymentRef: p.paymentRef,
        createdAt: p.createdAt,
        confirmedAt: p.confirmedAt,
      })),
      summary: {
        monthTotal: monthTotal._sum.amount || 0,
        monthCount: monthTotal._count,
        pendingCount,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
