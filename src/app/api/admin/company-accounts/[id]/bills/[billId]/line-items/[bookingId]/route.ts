import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { requireAdminAccess } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recalcOpenBill } from "@/lib/open-bill";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/admin/company-accounts/[id]/bills/[billId]/line-items/[bookingId]
 *
 * Manually overrides the priceValue for a single booking on an open bill,
 * then recalculates the bill totals (subtotal / discount / VAT / total).
 *
 * Only allowed on bills with status = "open" (not issued / paid / void).
 *
 * Body: { priceValue: number }   — amount in VND (integer, ≥ 0)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string; bookingId: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { billId, bookingId } = await params;

    const body = (await request.json()) as { priceValue?: unknown };
    const raw = body.priceValue;

    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      return error("priceValue must be a non-negative number", 400);
    }

    const priceValue = Math.round(raw); // ensure integer VND

    // Verify the booking belongs to this bill and the bill is still open
    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, companyOpenBillId: billId },
      select: { id: true, status: true, companyOpenBill: { select: { status: true } } },
    });

    if (!booking) return error("Booking not found on this bill", 404);
    if (booking.status === "cancelled") return error("Cannot edit price of a cancelled booking", 422);
    if (booking.companyOpenBill?.status !== "open") {
      return error("Price can only be edited on open (not yet issued) bills", 422);
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { priceValue },
    });

    await recalcOpenBill(billId);

    return json({ success: true, priceValue });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}
