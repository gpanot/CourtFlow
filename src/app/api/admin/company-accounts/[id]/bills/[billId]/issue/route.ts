import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requireAdminAccess } from "@/lib/auth";
import { issueBill, getOpenBillVenueSettings } from "@/lib/open-bill";
import { buildVietQRUrl } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/company-accounts/[id]/bills/[billId]/issue
 * Manually issue an open bill statement.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string }> }
) {
  try {
    const payload = await requireAdminAccess(request.headers);
    const { billId } = await params;

    const bill = await prisma.companyOpenBill.findUnique({
      where: { id: billId },
      include: {
        venue: { select: { settings: true, bankName: true, bankAccount: true, bankOwnerName: true } },
        companyAccount: { select: { paymentTermsDays: true, name: true, billingEmail: true } },
      },
    });
    if (!bill) return error("Bill not found", 404);

    const venueSettings = getOpenBillVenueSettings(bill.venue.settings as Record<string, unknown>);
    const dueDays = bill.companyAccount.paymentTermsDays ?? venueSettings.defaultDueDays;

    const { paymentRef, invoiceNumber, dueDate } = await issueBill(billId, {
      actorId: payload.id,
      actorType: "staff",
      dueDaysOverride: dueDays,
    });

    // Build VietQR URL for the statement
    const updatedBill = await prisma.companyOpenBill.findUnique({ where: { id: billId } });
    const qrUrl = updatedBill
      ? buildVietQRUrl({
          bankBin: bill.venue.bankName || "",
          accountNumber: bill.venue.bankAccount || "",
          accountName: bill.venue.bankOwnerName || "",
          amount: updatedBill.totalAmount,
          description: paymentRef,
        })
      : null;

    return json({
      success: true,
      paymentRef,
      invoiceNumber,
      dueDate: dueDate.toISOString(),
      dueDays,
      qrUrl,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 400);
  }
}
