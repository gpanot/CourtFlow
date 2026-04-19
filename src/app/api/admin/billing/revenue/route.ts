import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";
import { getWeekBounds } from "@/lib/billing";

export async function GET(req: Request) {
  try {
    requireSuperAdmin(req.headers);

    const { weekStart } = getWeekBounds();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [thisWeek, thisMonth, allTime, paidThisMonth, outstanding] =
      await Promise.all([
        prisma.billingInvoice.aggregate({
          where: { weekStartDate: { gte: weekStart } },
          _sum: { totalAmount: true },
        }),
        prisma.billingInvoice.aggregate({
          where: { createdAt: { gte: monthStart } },
          _sum: { totalAmount: true },
        }),
        prisma.billingInvoice.aggregate({
          _sum: { totalAmount: true },
        }),
        prisma.billingInvoice.aggregate({
          where: {
            status: "paid",
            createdAt: { gte: monthStart },
          },
          _sum: { totalAmount: true },
        }),
        prisma.billingInvoice.aggregate({
          where: { status: { in: ["pending", "overdue"] } },
          _sum: { totalAmount: true },
        }),
      ]);

    return NextResponse.json({
      thisWeek: thisWeek._sum.totalAmount ?? 0,
      thisMonth: thisMonth._sum.totalAmount ?? 0,
      allTime: allTime._sum.totalAmount ?? 0,
      paidThisMonth: paidThisMonth._sum.totalAmount ?? 0,
      outstanding: outstanding._sum.totalAmount ?? 0,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
