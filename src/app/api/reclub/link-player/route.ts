import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const { courtpayPlayerId, reclubUserId } = await parseBody<{
      courtpayPlayerId: string;
      reclubUserId: number;
    }>(request);

    if (!courtpayPlayerId?.trim()) return error("courtpayPlayerId is required");
    if (!reclubUserId || typeof reclubUserId !== "number") return error("reclubUserId is required");

    const player = await prisma.player.findUnique({ where: { id: courtpayPlayerId } });
    if (!player) return error("Player not found", 404);

    const updated = await prisma.player.update({
      where: { id: courtpayPlayerId },
      data: { reclubUserId },
      select: { id: true, name: true, reclubUserId: true },
    });

    return json({ success: true, player: updated });
  } catch (e) {
    console.error("[reclub/link-player POST]", e);
    return error((e as Error).message, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    requireStaff(request.headers);

    const { courtpayPlayerId } = await parseBody<{
      courtpayPlayerId: string;
    }>(request);

    if (!courtpayPlayerId?.trim()) return error("courtpayPlayerId is required");

    const player = await prisma.player.findUnique({ where: { id: courtpayPlayerId } });
    if (!player) return error("Player not found", 404);

    const updated = await prisma.player.update({
      where: { id: courtpayPlayerId },
      data: { reclubUserId: null },
      select: { id: true, name: true, reclubUserId: true },
    });

    return json({ success: true, player: updated });
  } catch (e) {
    console.error("[reclub/link-player DELETE]", e);
    return error((e as Error).message, 500);
  }
}
