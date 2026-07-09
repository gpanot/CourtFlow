import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requireManagerOrSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/company-accounts/[id]/players/[playerId]
 * Unlink a player from a company account. Manager-only.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> }
) {
  try {
    await requireManagerOrSuperAdmin(request.headers);
    const { id: companyAccountId, playerId } = await params;

    await prisma.companyAccountPlayer.deleteMany({
      where: { companyAccountId, playerId },
    });

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}
