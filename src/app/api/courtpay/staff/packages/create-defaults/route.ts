import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

const DEFAULT_PACKAGES = [
  { name: "Starter",   sessions: 5,    durationDays: 60, price: 0, perks: null, discountPct: 5,  isBestChoice: false },
  { name: "Regular",   sessions: 10,   durationDays: 90, price: 0, perks: null, discountPct: 10, isBestChoice: true  },
  { name: "3 Months Unlimited", sessions: null, durationDays: 90, price: 0, perks: null, discountPct: 40, isBestChoice: false },
];

export async function POST(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const body = await req.json().catch(() => ({}));
    const venueId = body.venueId || staff.venueId;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const existingCount = await prisma.subscriptionPackage.count({
      where: { venueId, isActive: true },
    });

    if (existingCount > 0) {
      return NextResponse.json(
        { error: "Packages already exist for this venue" },
        { status: 409 }
      );
    }

    const created = await prisma.$transaction(
      DEFAULT_PACKAGES.map((pkg) =>
        prisma.subscriptionPackage.create({
          data: { venueId, ...pkg },
        })
      )
    );

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { settings: true },
    });
    const currentSettings = (venue?.settings ?? {}) as Record<string, unknown>;
    await prisma.venue.update({
      where: { id: venueId },
      data: {
        settings: {
          ...currentSettings,
          showSubscriptionsInFlow: true,
        },
      },
    });

    return NextResponse.json({ packages: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
