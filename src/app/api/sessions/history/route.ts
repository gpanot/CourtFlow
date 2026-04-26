import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

function classifyPayment(p: { paymentMethod: string; type: string }): "qr" | "cash" | "sub" {
  if (p.paymentMethod === "cash") return "cash";
  if (p.paymentMethod === "subscription" || p.type === "subscription") return "sub";
  return "qr";
}

export async function GET(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const venueId = request.nextUrl.searchParams.get("venueId");
    if (!venueId) return error("venueId is required");

    const fromIso = request.nextUrl.searchParams.get("from");
    const toIso = request.nextUrl.searchParams.get("to");

    const sessionWhere: {
      venueId: string;
      status: "closed";
      openedAt?: { gte: Date; lte: Date };
    } = { venueId, status: "closed" };

    if (fromIso && toIso) {
      const from = new Date(fromIso);
      const to = new Date(toIso);
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
        sessionWhere.openedAt = { gte: from, lte: to };
      }
    }

    const take = fromIso && toIso ? 2000 : 50;

    const sessions = await prisma.session.findMany({
      where: sessionWhere,
      orderBy: { openedAt: "desc" },
      take,
      include: {
        _count: {
          select: {
            queueEntries: true,
            courtAssignments: true,
          },
        },
      },
    });

    const result = sessions.map((s) => ({
      id: s.id,
      date: s.date.toISOString(),
      openedAt: s.openedAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
      playerCount: s._count.queueEntries,
      gameCount: s._count.courtAssignments,
    }));

    const sessionsWithPayments = await Promise.all(
      result.map(async (s) => {
        const periodEnd = s.closedAt ? new Date(s.closedAt) : new Date();
        const periodStart = new Date(s.openedAt);
        const payments = await prisma.pendingPayment.findMany({
          where: {
            venueId,
            status: "confirmed",
            OR: [
              { sessionId: s.id },
              {
                checkInPlayerId: { not: null },
                confirmedAt: {
                  gte: periodStart,
                  lte: periodEnd,
                },
              },
            ],
          },
          select: { amount: true, paymentMethod: true, type: true, partyCount: true },
        });
        let qr = 0;
        let cash = 0;
        let sub = 0;
        let paymentPeopleTotal = 0;
        for (const p of payments) {
          const b = classifyPayment(p);
          if (b === "qr") qr += 1;
          else if (b === "cash") cash += 1;
          else sub += 1;
          const party = typeof p.partyCount === "number" && p.partyCount > 0 ? p.partyCount : 1;
          paymentPeopleTotal += party;
        }
        return {
          ...s,
          paymentCount: payments.length,
          paymentPeopleTotal,
          paymentRevenue: payments.reduce((sum, p) => sum + p.amount, 0),
          paymentQrCount: qr,
          paymentCashCount: cash,
          paymentSubCount: sub,
        };
      })
    );

    return json(sessionsWithPayments);
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
