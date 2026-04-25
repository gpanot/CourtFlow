import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

/**
 * POST /api/courtpay/staff/ensure-check-in-player
 *
 * Maps a legacy `Player` (self / face app) to a `CheckInPlayer` at the venue
 * so staff check-in can use CourtPay-only payment APIs.
 */
export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);
    const { venueId, playerId } = await parseBody<{
      venueId?: string;
      playerId?: string;
    }>(request);

    if (!venueId?.trim()) return error("venueId is required", 400);
    if (!playerId?.trim()) return error("playerId is required", 400);

    const venue = await prisma.venue.findFirst({
      where: { id: venueId.trim(), active: true },
      select: { id: true },
    });
    if (!venue) return error("Venue not found", 404);

    const player = await prisma.player.findUnique({
      where: { id: playerId.trim() },
      select: { id: true, name: true, phone: true, gender: true, skillLevel: true },
    });
    if (!player) return error("Player not found", 404);

    let checkInPlayer = await prisma.checkInPlayer.findUnique({
      where: { phone_venueId: { phone: player.phone, venueId: venue.id } },
    });

    if (!checkInPlayer) {
      checkInPlayer = await prisma.checkInPlayer.create({
        data: {
          venueId: venue.id,
          name: player.name,
          phone: player.phone,
          gender: player.gender ? String(player.gender) : null,
          skillLevel: player.skillLevel ? String(player.skillLevel) : null,
        },
      });
    }

    return json({
      checkInPlayer: {
        id: checkInPlayer.id,
        name: checkInPlayer.name,
        phone: checkInPlayer.phone,
      },
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
