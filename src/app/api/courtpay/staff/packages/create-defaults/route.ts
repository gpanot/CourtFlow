import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

const DEFAULT_PACKAGES = [
  { name: "Starter", sessions: 5, durationDays: 60, price: 0, perks: null },
  { name: "Regular", sessions: 10, durationDays: 90, price: 0, perks: null },
  { name: "Unlimited", sessions: null, durationDays: 30, price: 0, perks: null },
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

    return NextResponse.json({ packages: created }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
