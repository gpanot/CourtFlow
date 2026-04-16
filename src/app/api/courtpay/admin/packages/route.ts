import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    requireSuperAdmin(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId");
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Record<string, unknown> = {};
    if (venueId) where.venueId = venueId;
    if (!includeInactive) where.isActive = true;

    const packages = await prisma.subscriptionPackage.findMany({
      where,
      include: {
        venue: { select: { id: true, name: true } },
        _count: {
          select: {
            subscriptions: { where: { status: "active" } },
          },
        },
      },
      orderBy: [{ venueId: "asc" }, { price: "asc" }],
    });

    return NextResponse.json({ packages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
