import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { voidBill } from "@/lib/open-bill";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/company-accounts/[id]/bills/[billId]/void
 * Void a bill. Manager-only (not delegated to staff).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string }> }
) {
  try {
    const payload = await requireManagerOrSuperAdmin(request.headers);
    const { billId } = await params;
    const body = await request.json().catch(() => ({})) as { reason?: string };

    const bill = await prisma.companyOpenBill.findUnique({ where: { id: billId } });
    if (!bill) return error("Bill not found", 404);

    await voidBill(billId, payload.id, body.reason ?? "Voided by manager.");

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 400);
  }
}
