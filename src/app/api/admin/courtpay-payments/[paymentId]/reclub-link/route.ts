import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { parseBody } from "@/lib/api-helpers";

export const dynamic = "force-dynamic";

/**
 * GET  ?venueId=&search=  — search players with reclubUserId at a venue
 *                           also returns the session's reclubSnapshot roster
 * PATCH                  — link or unlink a reclubUserId on the payment's CheckInPlayer
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    requireManagerOrSuperAdmin(req.headers);
    const { paymentId } = await params;
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim() ?? "";

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        venueId: true,
        sessionId: true,
        checkInPlayerId: true,
        checkInPlayer: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Reclub snapshot roster from the session (if available)
    let snapshotRoster: Array<{
      reclubUserId: number;
      reclubName: string;
      avatarUrl: string;
      paid: boolean;
    }> = [];

    if (payment.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: payment.sessionId },
        select: { reclubSnapshot: true },
      });
      if (session?.reclubSnapshot) {
        const snap = session.reclubSnapshot as {
          players?: Array<{
            reclubUserId: number;
            reclubName: string;
            avatarUrl: string;
            paid: boolean;
          }>;
        };
        snapshotRoster = (snap.players ?? []).filter((p) => p.reclubName);
      }
    }

    // Global DB search for players with a reclubUserId at this venue
    const dbPlayers = await prisma.player.findMany({
      where: {
        reclubUserId: { not: null },
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        phone: true,
        reclubUserId: true,
      },
      orderBy: { name: "asc" },
      take: 30,
    });

    // Find which reclubUserIds are already taken by another CheckInPlayer at this venue
    const allReclubIds = dbPlayers
      .map((p) => p.reclubUserId)
      .filter((id): id is number => id !== null);

    const takenLinks = await prisma.player.findMany({
      where: { reclubUserId: { in: allReclubIds } },
      select: { reclubUserId: true, phone: true },
    });
    // Build a set of reclubUserIds already linked to a *different* checkInPlayer phone
    const takenSet = new Set<number>();
    const currentPhone = payment.checkInPlayer?.phone;
    for (const t of takenLinks) {
      if (t.reclubUserId && t.phone !== currentPhone) {
        takenSet.add(t.reclubUserId);
      }
    }

    // Current linked reclubUserId (via checkInPlayer's phone → Player)
    let currentReclubUserId: number | null = null;
    if (currentPhone) {
      const linked = await prisma.player.findUnique({
        where: { phone: currentPhone },
        select: { reclubUserId: true },
      });
      currentReclubUserId = linked?.reclubUserId ?? null;
    }

    return NextResponse.json({
      currentReclubUserId,
      checkInPlayer: payment.checkInPlayer,
      snapshotRoster,
      dbPlayers: dbPlayers.map((p) => ({
        ...p,
        taken: takenSet.has(p.reclubUserId!),
      })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    requireManagerOrSuperAdmin(req.headers);
    const { paymentId } = await params;
    const body = await parseBody<{ action: "link" | "unlink"; reclubUserId?: number }>(req);

    const payment = await prisma.pendingPayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        checkInPlayer: { select: { id: true, phone: true } },
      },
    });
    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }
    if (!payment.checkInPlayer?.phone) {
      return NextResponse.json({ error: "No checkInPlayer on this payment" }, { status: 400 });
    }

    const phone = payment.checkInPlayer.phone;

    if (body.action === "unlink") {
      // Remove reclubUserId from the Player matching this phone
      const player = await prisma.player.findUnique({
        where: { phone },
        select: { id: true },
      });
      if (player) {
        await prisma.player.update({
          where: { id: player.id },
          data: { reclubUserId: null },
        });
      }
      return NextResponse.json({ ok: true, reclubUserId: null });
    }

    if (body.action === "link") {
      if (typeof body.reclubUserId !== "number") {
        return NextResponse.json({ error: "reclubUserId required for link" }, { status: 400 });
      }

      // Check not already taken by someone else
      const existing = await prisma.player.findFirst({
        where: { reclubUserId: body.reclubUserId },
        select: { id: true, phone: true },
      });
      if (existing && existing.phone !== phone) {
        return NextResponse.json(
          { error: "This Reclub ID is already linked to another player" },
          { status: 409 }
        );
      }

      // Upsert: find or create the global Player by phone, then set reclubUserId
      let player = await prisma.player.findUnique({
        where: { phone },
        select: { id: true },
      });
      if (!player) {
        // Create a minimal Player from checkInPlayer data
        const cip = await prisma.checkInPlayer.findUnique({
          where: { id: payment.checkInPlayer!.id },
          select: { name: true, phone: true },
        });
        player = await prisma.player.create({
          data: {
            name: cip?.name ?? phone,
            phone,
            reclubUserId: body.reclubUserId,
          },
        });
      } else {
        await prisma.player.update({
          where: { id: player.id },
          data: { reclubUserId: body.reclubUserId },
        });
      }

      return NextResponse.json({ ok: true, reclubUserId: body.reclubUserId });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    const status = msg.includes("access") || msg.includes("token") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
