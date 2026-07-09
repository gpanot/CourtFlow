import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/company-accounts/[id]/players
 * Link a player to a company account. Manager-only.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireManagerOrSuperAdmin(request.headers);
    const { id: companyAccountId } = await params;
    const { playerId } = await request.json() as { playerId: string };

    if (!playerId) return error("playerId is required", 400);

    const account = await prisma.companyAccount.findUnique({ where: { id: companyAccountId } });
    if (!account) return error("Company account not found", 404);

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) return error("Player not found", 404);

    // Check if already linked
    const existing = await prisma.companyAccountPlayer.findFirst({
      where: { companyAccountId, playerId },
    });
    if (existing) return json(existing); // idempotent

    const link = await prisma.companyAccountPlayer.create({
      data: {
        id: generateId("cap"),
        companyAccountId,
        playerId,
        addedBy: payload.id,
      },
      include: {
        player: { select: { id: true, name: true, phone: true, email: true } },
      },
    });

    return json(link, 201);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}

function generateId(prefix: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let id = prefix + "_";
  for (let i = 0; i < 20; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}
