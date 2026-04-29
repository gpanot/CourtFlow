import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireStaff } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);

    const discounts = await prisma.playerCustomPrice.findMany({
      where: { staffId: auth.id },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            phone: true,
            facePhotoPath: true,
            avatarPhotoPath: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return json({ discounts });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{
      playerId: string;
      discountType: string;
      customFee?: number;
      discountPct?: number;
      note?: string;
    }>(request);

    if (!body.playerId?.trim()) return error("playerId is required", 400);
    if (body.discountType !== "fixed" && body.discountType !== "percent") {
      return error("discountType must be 'fixed' or 'percent'", 400);
    }

    if (body.discountType === "fixed") {
      if (!body.customFee || body.customFee <= 0) {
        return error("customFee is required for fixed discount", 400);
      }
    } else {
      if (!body.discountPct || body.discountPct < 1 || body.discountPct > 99) {
        return error("discountPct must be between 1 and 99", 400);
      }
    }

    const player = await prisma.player.findUnique({ where: { id: body.playerId } });
    if (!player) return error("Player not found", 404);

    const discount = await prisma.playerCustomPrice.upsert({
      where: {
        playerId_staffId: { playerId: body.playerId, staffId: auth.id },
      },
      create: {
        playerId: body.playerId,
        staffId: auth.id,
        discountType: body.discountType,
        customFee: body.discountType === "fixed" ? body.customFee : null,
        discountPct: body.discountType === "percent" ? body.discountPct : null,
        note: body.note?.trim() || null,
      },
      update: {
        discountType: body.discountType,
        customFee: body.discountType === "fixed" ? body.customFee : null,
        discountPct: body.discountType === "percent" ? body.discountPct : null,
        note: body.note?.trim() || null,
      },
      include: {
        player: {
          select: { id: true, name: true, phone: true, facePhotoPath: true, avatarPhotoPath: true },
        },
      },
    });

    return json({ discount });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = requireStaff(request.headers);
    const body = await parseBody<{ playerId: string }>(request);

    if (!body.playerId?.trim()) return error("playerId is required", 400);

    const existing = await prisma.playerCustomPrice.findUnique({
      where: {
        playerId_staffId: { playerId: body.playerId, staffId: auth.id },
      },
    });
    if (!existing) return error("Discount not found", 404);

    await prisma.playerCustomPrice.delete({
      where: { id: existing.id },
    });

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
