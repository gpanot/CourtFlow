import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody, notFound } from "@/lib/api-helpers";
import { requireSuperAdmin } from "@/lib/auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const existing = await prisma.player.findUnique({ where: { id: playerId } });
    if (!existing) return notFound("Player not found");

    const body = await parseBody<{
      name?: string;
      phone?: string;
      skillLevel?: string;
      gender?: string;
      avatar?: string;
      gamePreference?: string;
    }>(request);

    const player = await prisma.player.update({
      where: { id: playerId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.phone !== undefined && { phone: body.phone }),
        ...(body.skillLevel !== undefined && { skillLevel: body.skillLevel as never }),
        ...(body.gender !== undefined && { gender: body.gender as never }),
        ...(body.avatar !== undefined && { avatar: body.avatar }),
        ...(body.gamePreference !== undefined && { gamePreference: body.gamePreference as never }),
      },
    });

    return json(player);
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") {
      return error("Phone number already in use", 409);
    }
    return error((e as Error).message, 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  try {
    requireSuperAdmin(request.headers);
    const { playerId } = await params;

    const existing = await prisma.player.findUnique({ where: { id: playerId } });
    if (!existing) return notFound("Player not found");

    const activeMemberships = await prisma.membership.count({
      where: { playerId, status: "active" },
    });
    if (activeMemberships > 0) {
      return error("Cannot delete player with active memberships. Cancel them first.", 400);
    }

    const confirmedBookings = await prisma.booking.count({
      where: { playerId, status: "confirmed" },
    });
    if (confirmedBookings > 0) {
      return error("Cannot delete player with confirmed bookings. Cancel them first.", 400);
    }

    await prisma.pushSubscription.deleteMany({ where: { playerId } });
    await prisma.queueEntry.deleteMany({ where: { playerId } });
    await prisma.booking.deleteMany({ where: { playerId } });
    await prisma.membership.deleteMany({ where: { playerId } });
    await prisma.player.delete({ where: { id: playerId } });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
