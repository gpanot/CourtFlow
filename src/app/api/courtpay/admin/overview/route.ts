import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const auth = requireSuperAdmin(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId");

    const venueFilter = venueId ? { venueId } : {};
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalSubscribers,
      activeSubscribers,
      totalPackages,
      monthRevenue,
      totalCheckIns,
      todayCheckIns,
      venues,
    ] = await Promise.all([
      prisma.playerSubscription.count({ where: venueFilter }),
      prisma.playerSubscription.count({
        where: { ...venueFilter, status: "active", expiresAt: { gt: now } },
      }),
      prisma.subscriptionPackage.count({
        where: { ...venueFilter, isActive: true },
      }),
      prisma.pendingPayment.aggregate({
        where: {
          ...venueFilter,
          status: "confirmed",
          checkInPlayerId: { not: null },
          confirmedAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      prisma.checkInRecord.count({ where: venueFilter }),
      prisma.checkInRecord.count({
        where: {
          ...venueFilter,
          checkedInAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      prisma.venue.findMany({
        where: {
          ...(venueId ? { id: venueId } : {}),
          staffAssignments: { some: { staffId: auth.id } },
        },
        select: { id: true, name: true, settings: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const autoApprovalProfiles = venues.map((v) => {
      const settings = (v.settings ?? {}) as Record<string, unknown>;
      return {
        venueId: v.id,
        venueName: v.name,
        autoApprovalPhone:
          typeof settings.autoApprovalPhone === "string"
            ? settings.autoApprovalPhone
            : "",
        autoApprovalCCCD:
          typeof settings.autoApprovalCCCD === "string"
            ? settings.autoApprovalCCCD
            : "",
      };
    });

    return NextResponse.json({
      totalSubscribers,
      activeSubscribers,
      totalPackages,
      monthRevenue: monthRevenue._sum.amount || 0,
      totalCheckIns,
      todayCheckIns,
      autoApprovalProfiles,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
