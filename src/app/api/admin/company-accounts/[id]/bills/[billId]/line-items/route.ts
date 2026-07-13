import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { getOpenBillLineItems } from "@/lib/open-bill";

export const dynamic = "force-dynamic";

/** GET /api/admin/company-accounts/[id]/bills/[billId]/line-items */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { billId } = await params;
    const lineItems = await getOpenBillLineItems(billId);
    return json(lineItems);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}
