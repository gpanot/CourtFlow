import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireManagerOrSuperAdmin(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const passTypeId = request.nextUrl.searchParams.get("passTypeId");
    const status = request.nextUrl.searchParams.get("status");

    const passes = await prisma.programPass.findMany({
      where: {
        venueId,
        ...(passTypeId && { passTypeId }),
        ...(status && { status: status as "active" | "paused" | "expired" | "cancelled" }),
      },
      include: {
        player: { select: { id: true, name: true, phone: true, avatar: true } },
        passType: {
          select: {
            id: true,
            name: true,
            price: true,
            sessionsIncluded: true,
            coaches: {
              include: { coach: { select: { id: true, name: true } } },
            },
          },
        },
        payments: {
          orderBy: { periodStart: "desc" },
          take: 1,
        },
      },
      orderBy: { activatedAt: "desc" },
    });

    const now = new Date();
    const result = passes.map((p) => {
      const latestPayment = p.payments[0] || null;
      let currentPaymentStatus: string | null = null;
      if (latestPayment) {
        if (latestPayment.status === "UNPAID" && latestPayment.periodEnd < now) {
          currentPaymentStatus = "OVERDUE";
        } else {
          currentPaymentStatus = latestPayment.status;
        }
      }
      return {
        ...p,
        payments: undefined,
        latestPayment,
        currentPaymentStatus,
      };
    });

    // KPI — current calendar month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const [collectedAgg, unpaidCount, overdueCount] = await Promise.all([
      prisma.programPassPayment.aggregate({
        where: {
          programPass: { venueId },
          status: "PAID",
          paidAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amountValue: true },
      }),
      prisma.programPassPayment.count({
        where: {
          programPass: { venueId },
          status: "UNPAID",
          periodEnd: { gte: now },
        },
      }),
      prisma.programPassPayment.count({
        where: {
          programPass: { venueId },
          status: "UNPAID",
          periodEnd: { lt: now },
        },
      }),
    ]);

    return json({
      passes: result,
      kpi: {
        collected: collectedAgg._sum.amountValue ?? 0,
        unpaidCount,
        overdueCount,
      },
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
