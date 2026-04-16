import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;
    const status = searchParams.get("status");
    const packageId = searchParams.get("packageId");
    const search = searchParams.get("search");

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const where: Record<string, unknown> = { venueId };
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
        player: true,
        package: true,
        _count: { select: { usages: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ subscribers });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
