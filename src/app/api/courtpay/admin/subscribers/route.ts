import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    requireSuperAdmin(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId");
    const status = searchParams.get("status");
    const packageId = searchParams.get("packageId");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (venueId) where.venueId = venueId;
    if (status) where.status = status;
    if (packageId) where.packageId = packageId;

    if (search) {
      where.player = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
        ],
      };
    }

    const subscribers = await prisma.playerSubscription.findMany({
      where,
      include: {
        player: { include: { venue: { select: { name: true } } } },
        package: true,
        _count: { select: { usages: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      subscribers: subscribers.map((s) => ({
        id: s.id,
        playerName: s.player.name,
        playerPhone: s.player.phone,
        venueName: s.player.venue.name,
        venueId: s.player.venueId,
        packageName: s.package.name,
        packagePrice: s.package.price,
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
