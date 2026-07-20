import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    requireSuperAdmin(request.headers);
    const sp = request.nextUrl.searchParams;
    const venueId = sp.get("venueId");
    if (!venueId) return error("venueId is required");

    /* ── List mode: paginated, filterable payment records ────────────── */
    if (sp.get("list") === "true") {
      const dateFrom = sp.get("dateFrom");
      const dateTo = sp.get("dateTo");
      const paymentStatusFilter = sp.get("paymentStatus") ?? "all";
      const passTypeFilter = sp.get("passTypeId") ?? "all";
      const search = sp.get("search")?.trim() ?? "";
      const page = Math.max(1, parseInt(sp.get("page") ?? "1"));
      const pageSize = Math.min(100, parseInt(sp.get("pageSize") ?? "50"));

      const passWhere: Prisma.ProgramPassWhereInput = { venueId };
      if (passTypeFilter !== "all") passWhere.passTypeId = passTypeFilter;
      if (search.length >= 2) {
        passWhere.player = {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
          ],
        };
      }

      if (paymentStatusFilter === "pending") {
        passWhere.payments = { some: { status: "UNPAID", proofUrl: null } };
      } else if (paymentStatusFilter === "proof_submitted") {
        passWhere.payments = { some: { status: "UNPAID", proofUrl: { not: null } } };
      } else if (paymentStatusFilter === "paid") {
        passWhere.payments = { some: { status: "PAID" } };
      }

      if (dateFrom) {
        const d = new Date(dateFrom); d.setHours(0, 0, 0, 0);
        passWhere.createdAt = { ...(passWhere.createdAt as Prisma.DateTimeFilter ?? {}), gte: d };
      }
      if (dateTo) {
        const d = new Date(dateTo); d.setHours(23, 59, 59, 999);
        passWhere.createdAt = { ...(passWhere.createdAt as Prisma.DateTimeFilter ?? {}), lte: d };
      }

      const [total, passes] = await Promise.all([
        prisma.programPass.count({ where: passWhere }),
        prisma.programPass.findMany({
          where: passWhere,
          include: {
            player: { select: { id: true, name: true, phone: true, avatar: true } },
            passType: { select: { id: true, name: true, price: true, sessionsIncluded: true } },
            programRun: { select: { id: true, name: true } },
            payments: {
              orderBy: { createdAt: "desc" },
              take: 1,
              select: {
                id: true,
                status: true,
                amountValue: true,
                paymentMethod: true,
                paidAt: true,
                proofUrl: true,
                paymentRef: true,
                invoiceNumber: true,
                note: true,
                createdAt: true,
                periodStart: true,
                periodEnd: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
      ]);

      const now = new Date();
      const rows = passes.map((p) => {
        const pay = p.payments[0] ?? null;
        let paymentStatus: string | null = null;
        if (pay) {
          if (pay.status === "UNPAID" && pay.proofUrl) paymentStatus = "proof_submitted";
          else if (pay.status === "UNPAID" && pay.periodEnd < now) paymentStatus = "overdue";
          else if (pay.status === "UNPAID") paymentStatus = "pending";
          else if (pay.status === "PAID") paymentStatus = "paid";
          else paymentStatus = pay.status.toLowerCase();
        }
        return {
          id: p.id,
          venueId: p.venueId,
          playerId: p.playerId,
          passTypeId: p.passTypeId,
          programRunId: p.programRunId,
          status: p.status,
          sessionsUsed: p.sessionsUsed,
          createdAt: p.createdAt,
          player: p.player,
          passType: p.passType,
          programRun: p.programRun,
          latestPayment: pay,
          paymentStatus,
        };
      });

      return json({ rows, total, totalPages: Math.ceil(total / pageSize) });
    }

    /* ── Legacy passes-tab mode ──────────────────────────────────────── */
    const passTypeId = sp.get("passTypeId");
    const status = sp.get("status");

    const passes = await prisma.programPass.findMany({
      where: {
        venueId,
        ...(passTypeId && { passTypeId }),
        ...(status && { status: status as "active" | "expired" | "cancelled" }),
      },
      include: {
        player: { select: { id: true, name: true, phone: true, avatar: true } },
        passType: {
          include: {
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
