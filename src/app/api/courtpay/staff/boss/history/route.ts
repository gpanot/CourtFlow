import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;
    const days = parseInt(searchParams.get("days") || "30", 10);

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    since.setUTCHours(0, 0, 0, 0);

    const payments = await prisma.pendingPayment.findMany({
      where: {
        venueId,
        status: "confirmed",
        checkInPlayerId: { not: null },
        confirmedAt: { gte: since },
      },
      include: { checkInPlayer: true },
      orderBy: { confirmedAt: "desc" },
    });

    const dailyRevenue: Record<string, { date: string; total: number; count: number }> = {};
    for (const p of payments) {
      const day = (p.confirmedAt || p.createdAt).toISOString().slice(0, 10);
      if (!dailyRevenue[day]) dailyRevenue[day] = { date: day, total: 0, count: 0 };
      dailyRevenue[day].total += p.amount;
      dailyRevenue[day].count += 1;
    }

    return NextResponse.json({
      payments: payments.map((p) => ({
        id: p.id,
        playerName: p.checkInPlayer?.name || "Unknown",
        amount: p.amount,
        type: p.type,
        paymentMethod: p.paymentMethod,
        confirmedAt: p.confirmedAt,
        paymentRef: p.paymentRef,
      })),
      dailyRevenue: Object.values(dailyRevenue).sort(
        (a, b) => b.date.localeCompare(a.date)
      ),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
