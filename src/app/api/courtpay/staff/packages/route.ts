import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

const MAX_ACTIVE_PACKAGES = 3;

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    // DELETE soft-deactivates (`isActive: false`). List only active packages so
    // removed rows do not still appear (and do not stack with create-defaults).
    const packages = await prisma.subscriptionPackage.findMany({
      where: { venueId, isActive: true },
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: {
            subscriptions: { where: { status: "active" } },
          },
        },
      },
    });

    return NextResponse.json({ packages });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const body = await req.json();
    const { venueId: bodyVenueId, name, sessions, durationDays, price, perks, discountPct, isBestChoice } = body;
    const venueId = bodyVenueId || staff.venueId;

    if (!venueId || !name || durationDays === undefined || price === undefined) {
      return NextResponse.json(
        { error: "name, durationDays, and price are required" },
        { status: 400 }
      );
    }

    const activeCount = await prisma.subscriptionPackage.count({
      where: { venueId, isActive: true },
    });
    if (activeCount >= MAX_ACTIVE_PACKAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_ACTIVE_PACKAGES} active packages allowed` },
        { status: 409 }
      );
    }

    const pkg = await prisma.subscriptionPackage.create({
      data: {
        venueId,
        name: name.trim(),
        sessions: sessions ?? null,
        durationDays,
        price,
        perks: perks?.trim() || null,
        discountPct: discountPct ?? null,
        isBestChoice: isBestChoice ?? false,
      },
    });

    return NextResponse.json({ package: pkg }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
