import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    requireManagerOrSuperAdmin(req.headers);
    const venueId = req.nextUrl.searchParams.get("venueId");
    if (!venueId?.trim()) {
      return NextResponse.json({ error: "venueId is required" }, { status: 400 });
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { settings: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const settings = (venue.settings ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      showSubscriptionsInFlow: settings.showSubscriptionsInFlow !== false,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    requireManagerOrSuperAdmin(req.headers);
    const body = (await req.json()) as { venueId: string; showSubscriptionsInFlow: boolean };
    const { venueId, showSubscriptionsInFlow } = body;
    if (!venueId?.trim()) {
      return NextResponse.json({ error: "venueId is required" }, { status: 400 });
    }
    if (typeof showSubscriptionsInFlow !== "boolean") {
      return NextResponse.json({ error: "showSubscriptionsInFlow must be a boolean" }, { status: 400 });
    }

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { settings: true },
    });
    if (!venue) {
      return NextResponse.json({ error: "Venue not found" }, { status: 404 });
    }

    const currentSettings = (venue.settings ?? {}) as Record<string, unknown>;
    await prisma.venue.update({
      where: { id: venueId },
      data: { settings: { ...currentSettings, showSubscriptionsInFlow } },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
