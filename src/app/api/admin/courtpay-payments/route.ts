import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { parseBody } from "@/lib/api-helpers";
import { assertVenueAccess } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/courtpay-payments?venueId=&search=
 *
 * Search CheckInPlayers at a venue by name or phone.
 * Used to populate the player picker in the manual add-payment modal.
 */
export async function GET(req: NextRequest) {
  try {
    requireManagerOrSuperAdmin(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") ?? "";
    const search = searchParams.get("search")?.trim() ?? "";

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const players = await prisma.checkInPlayer.findMany({
      where: {
        venueId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { phone: { contains: search } },
              ],
            }
          : {}),
      },
      select: { id: true, name: true, phone: true, skillLevel: true },
      orderBy: { name: "asc" },
      take: 30,
    });

    return NextResponse.json({ players });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * POST /api/admin/courtpay-payments
 * Body: { sessionId, venueId, playerPhone, playerName, amount, partyCount, paymentMethod, confirmedAt }
 *
 * Manually creates a confirmed payment entry for a session.
 * - Upserts CheckInPlayer by (phone, venueId)
 * - Walk-in: if no phone, uses a generated placeholder
 * - Creates PendingPayment with status "confirmed"
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(req.headers);
    const body = await parseBody<{
      sessionId: string;
      venueId: string;
      playerPhone: string;
      playerName: string;
      amount: number;
      partyCount?: number;
      paymentMethod: "cash" | "vietqr" | "subscription";
      confirmedAt: string;
    }>(req);

    const {
      sessionId,
      venueId,
      playerPhone,
      playerName,
      amount,
      partyCount = 1,
      paymentMethod,
      confirmedAt,
    } = body;

    if (!sessionId || !venueId || !playerName || !amount || !paymentMethod || !confirmedAt) {
      return NextResponse.json(
        { error: "sessionId, venueId, playerName, amount, paymentMethod and confirmedAt are required" },
        { status: 400 }
      );
    }

    await assertVenueAccess(auth, venueId);

    // Confirm the session belongs to this venue
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: { id: true, venueId: true },
    });
    if (!session || session.venueId !== venueId) {
      return NextResponse.json({ error: "Session not found in this venue" }, { status: 404 });
    }

    const phone = playerPhone?.trim() || `walkin-${Date.now()}`;
    const confirmedDate = new Date(confirmedAt);
    if (isNaN(confirmedDate.getTime())) {
      return NextResponse.json({ error: "Invalid confirmedAt" }, { status: 400 });
    }

    // Upsert CheckInPlayer
    const checkInPlayer = await prisma.checkInPlayer.upsert({
      where: { phone_venueId: { phone, venueId } },
      update: {},
      create: { venueId, name: playerName, phone },
    });

    const payment = await prisma.pendingPayment.create({
      data: {
        venueId,
        sessionId,
        checkInPlayerId: checkInPlayer.id,
        amount,
        partyCount,
        paymentMethod,
        type: "checkin",
        status: "confirmed",
        confirmedAt: confirmedDate,
        confirmedBy: auth.id,
        expiresAt: new Date(confirmedDate.getTime() + 1000),
        createdAt: confirmedDate,
      },
      include: {
        checkInPlayer: { select: { id: true, name: true, phone: true, skillLevel: true } },
      },
    });

    return NextResponse.json({ payment }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    const status =
      msg.includes("Access denied") ? 403 :
      msg.includes("access") || msg.includes("token") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
