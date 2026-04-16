import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireStaff(req.headers);
    const { id } = await params;

    const subscription = await prisma.playerSubscription.findUnique({
      where: { id },
      include: {
        player: true,
        package: true,
        usages: { orderBy: { checkedInAt: "desc" } },
      },
    });

    if (!subscription) {
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
    }

    return NextResponse.json({
      subscription: {
        id: subscription.id,
        playerName: subscription.player.name,
        playerPhone: subscription.player.phone,
        packageName: subscription.package.name,
        packagePrice: subscription.package.price,
        status: subscription.status,
        sessionsRemaining: subscription.sessionsRemaining,
        totalSessions: subscription.package.sessions,
        activatedAt: subscription.activatedAt,
        expiresAt: subscription.expiresAt,
        usages: subscription.usages.map((u) => ({
          id: u.id,
          checkedInAt: u.checkedInAt,
        })),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
