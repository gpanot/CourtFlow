import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { activateSubscription } from "@/modules/courtpay/lib/subscription";

export const dynamic = "force-dynamic";

/**
 * POST /api/courtpay/admin/players/[playerId]/assign-subscription
 * Body: { packageId: string; source: "courtpay" | "self" }
 *
 * Assigns a subscription package to a player directly (admin only).
 * Mirrors the activateSubscription call in the face check-in flow,
 * without requiring a payment.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireManagerOrSuperAdmin(req.headers);
    const { playerId } = await params;
    const body = await req.json() as { packageId?: string; source?: string };
    const { packageId, source = "courtpay" } = body;

    if (!packageId) {
      return NextResponse.json({ error: "packageId is required" }, { status: 400 });
    }

    const pkg = await prisma.subscriptionPackage.findUnique({
      where: { id: packageId },
    });
    if (!pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 });
    }

    // Resolve the venueId and internal player id (CheckInPlayer or Player)
    let resolvedPlayerId = playerId;
    let venueId = pkg.venueId;

    if (source === "courtpay") {
      const cp = await prisma.checkInPlayer.findUnique({
        where: { id: playerId },
        select: { id: true, venueId: true },
      });
      if (!cp) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }
      resolvedPlayerId = cp.id;
      venueId = cp.venueId;
    } else {
      // self — use the Player record id directly
      const p = await prisma.player.findUnique({
        where: { id: playerId },
        select: { id: true },
      });
      if (!p) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }
    }

    // Block if a valid active subscription already exists for this player
    const existing = await prisma.playerSubscription.findFirst({
      where: {
        playerId: resolvedPlayerId,
        status: "active",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Player already has an active subscription." },
        { status: 409 }
      );
    }

    const subscription = await activateSubscription(
      resolvedPlayerId,
      packageId,
      venueId,
      null // no payment reference — admin-assigned
    );

    return NextResponse.json({ subscription }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
