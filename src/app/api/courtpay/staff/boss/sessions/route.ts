import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const subscriptions = await prisma.playerSubscription.findMany({
      where: { venueId },
      include: {
        player: true,
        package: true,
        _count: { select: { usages: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({
      subscriptions: subscriptions.map((s) => ({
        id: s.id,
        playerName: s.player.name,
        playerPhone: s.player.phone,
        packageName: s.package.name,
        status: s.status,
        sessionsRemaining: s.sessionsRemaining,
        totalSessions: s.package.sessions,
        usageCount: s._count.usages,
        activatedAt: s.activatedAt,
        expiresAt: s.expiresAt,
      })),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
