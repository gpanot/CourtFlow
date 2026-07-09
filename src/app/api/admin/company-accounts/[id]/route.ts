import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { requireAdminAccess, requireManagerOrSuperAdmin } from "@/lib/auth";
import { issueBill, voidBill, getOpenBillVenueSettings } from "@/lib/open-bill";

export const dynamic = "force-dynamic";

/** GET /api/admin/company-accounts/[id] */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { id } = await params;

    const account = await prisma.companyAccount.findUnique({
      where: { id },
      include: {
        primaryPlayer: {
          select: { id: true, name: true, phone: true, email: true },
        },
        players: {
          include: {
            player: { select: { id: true, name: true, phone: true, email: true } },
          },
        },
        bills: {
          orderBy: { periodStart: "desc" },
          include: {
            events: { orderBy: { createdAt: "desc" }, take: 10 },
          },
        },
      },
    });

    if (!account) return error("Company account not found", 404);
    return json(account);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}

/** PATCH /api/admin/company-accounts/[id] */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;
    const body = await request.json();

    const {
      name,
      billingEmail,
      taxId,
      billingAddress,
      vatPercent,
      priceVatMode,
      fixedDiscountPercent,
      paymentTermsDays,
      openBillCreditLimit,
      creditLimitMode,
      primaryPlayerId,
      contactPhone,
      isSolo,
      isActive,
    } = body as Record<string, unknown>;

    const account = await prisma.companyAccount.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name as string }),
        ...(billingEmail !== undefined && { billingEmail: billingEmail as string | null }),
        ...(taxId !== undefined && { taxId: taxId as string | null }),
        ...(billingAddress !== undefined && { billingAddress: billingAddress as string | null }),
        ...(vatPercent !== undefined && { vatPercent: vatPercent as number }),
        ...(priceVatMode !== undefined && { priceVatMode: priceVatMode as string }),
        ...(fixedDiscountPercent !== undefined && { fixedDiscountPercent: fixedDiscountPercent as number }),
        ...(paymentTermsDays !== undefined && { paymentTermsDays: paymentTermsDays as number | null }),
        ...(openBillCreditLimit !== undefined && { openBillCreditLimit: openBillCreditLimit as number | null }),
        ...(creditLimitMode !== undefined && { creditLimitMode: creditLimitMode as string }),
        ...(primaryPlayerId !== undefined && { primaryPlayerId: primaryPlayerId as string | null }),
        ...(contactPhone !== undefined && { contactPhone: contactPhone as string | null }),
        ...(isSolo !== undefined && { isSolo: isSolo as boolean }),
        ...(isActive !== undefined && { isActive: isActive as boolean }),
        updatedAt: new Date(),
      },
    });

    return json(account);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}

/**
 * DELETE /api/admin/company-accounts/[id]
 * Soft-deactivates the account. Issues any open bill first.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = await requireManagerOrSuperAdmin(request.headers);
    const { id } = await params;

    const account = await prisma.companyAccount.findUnique({
      where: { id },
      include: {
        bills: { where: { status: "open" } },
        venue: { select: { settings: true } },
      },
    });
    if (!account) return error("Company account not found", 404);

    const venueSettings = getOpenBillVenueSettings(
      account.venue.settings as Record<string, unknown>
    );

    // Issue any open bill before deactivating
    for (const bill of account.bills) {
      if (bill.subtotal > 0 || bill.totalAmount > 0) {
        await issueBill(bill.id, {
          actorId: payload.id,
          actorType: "staff",
          closeOpenBill: true,
          dueDaysOverride: venueSettings.defaultDueDays,
        });
      } else {
        // Empty bill — void it with audit trail
        await voidBill(bill.id, payload.id, "Account closed — empty bill voided.");
      }
    }

    await prisma.companyAccount.update({
      where: { id },
      data: { isActive: false, updatedAt: new Date() },
    });

    return json({ success: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) return error(msg, 401);
    return error(msg, 500);
  }
}
