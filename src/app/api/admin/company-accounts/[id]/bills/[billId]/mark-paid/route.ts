import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requireAdminAccess } from "@/lib/auth";
import { markBillPaid } from "@/lib/open-bill";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/company-accounts/[id]/bills/[billId]/mark-paid
 * Manually mark a bill as paid. Accessible to managers and staff with admin access.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string }> }
) {
  try {
    const payload = await requireAdminAccess(request.headers);
    const { billId } = await params;
    const body = await request.json().catch(() => ({})) as {
      method?: string;
      note?: string;
    };

    const bill = await prisma.companyOpenBill.findUnique({ where: { id: billId } });
    if (!bill) return error("Bill not found", 404);

    await markBillPaid(
      billId,
      payload.id,
      "staff",
      body.method ?? "manual",
      { note: body.note }
    );

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 400);
  }
}
