import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { json, error, parseBody } from "@/lib/api-helpers";
import { requireManagerOrSuperAdmin } from "@/lib/auth";
import { getAuthorizedVenueIds, assertVenueAccess } from "@/lib/venue-scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/courtpay-payment-settings?venueId=...
 * Returns the venue's CourtPay auto-payment configuration.
 * Accessible by manager and superadmin.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const venueId = request.nextUrl.searchParams.get("venueId");

    if (!venueId?.trim()) {
      // Return list of authorized venues when no venueId specified
      const venueIds = await getAuthorizedVenueIds(auth);
      const venues = await prisma.venue.findMany({
        where: { id: { in: venueIds } },
        select: { id: true, name: true, bankName: true, bankAccount: true, bankOwnerName: true, settings: true },
      });
      return json(
        venues.map((v) => {
          const s = (v.settings ?? {}) as Record<string, unknown>;
          return {
            id: v.id,
            name: v.name,
            bankName: v.bankName || "",
            bankAccount: v.bankAccount || "",
            bankOwnerName: v.bankOwnerName || "",
            autoApprovalPhone: typeof s.autoApprovalPhone === "string" ? s.autoApprovalPhone : "",
            autoApprovalCCCD: typeof s.autoApprovalCCCD === "string" ? s.autoApprovalCCCD : "",
            sepayEnabled: s.sepayEnabled === true,
            autoPaymentEnabled: s.autoPaymentEnabled === true,
            reclubGroupId: typeof s.reclubGroupId === "number" ? s.reclubGroupId : null,
          };
        })
      );
    }

    await assertVenueAccess(auth, venueId);

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { bankName: true, bankAccount: true, bankOwnerName: true, settings: true },
    });
    if (!venue) return error("Venue not found", 404);

    const s = (venue.settings ?? {}) as Record<string, unknown>;
    return json({
      bankName: venue.bankName || "",
      bankAccount: venue.bankAccount || "",
      bankOwnerName: venue.bankOwnerName || "",
      autoApprovalPhone: typeof s.autoApprovalPhone === "string" ? s.autoApprovalPhone : "",
      autoApprovalCCCD: typeof s.autoApprovalCCCD === "string" ? s.autoApprovalCCCD : "",
      sepayEnabled: s.sepayEnabled === true,
      autoPaymentEnabled: s.autoPaymentEnabled === true,
      reclubGroupId: typeof s.reclubGroupId === "number" ? s.reclubGroupId : null,
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}

/**
 * PATCH /api/admin/courtpay-payment-settings
 * Updates the venue's CourtPay auto-payment configuration.
 * Accessible by manager and superadmin.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = requireManagerOrSuperAdmin(request.headers);
    const body = await parseBody<{
      venueId: string;
      bankName?: string;
      bankAccount?: string;
      bankOwnerName?: string;
      autoApprovalPhone?: string;
      autoApprovalCCCD?: string;
      sepayEnabled?: boolean;
      autoPaymentEnabled?: boolean;
      reclubGroupId?: number | null;
    }>(request);

    const { venueId } = body;
    if (!venueId?.trim()) return error("venueId is required", 400);

    await assertVenueAccess(auth, venueId);

    const venueUpdate: Record<string, unknown> = {};

    if (body.bankName !== undefined) venueUpdate.bankName = body.bankName?.trim() || null;
    if (body.bankAccount !== undefined) venueUpdate.bankAccount = body.bankAccount?.trim() || null;
    if (body.bankOwnerName !== undefined) venueUpdate.bankOwnerName = body.bankOwnerName?.trim() || null;

    const hasSettingsPayload =
      body.autoApprovalPhone !== undefined ||
      body.autoApprovalCCCD !== undefined ||
      body.sepayEnabled !== undefined ||
      body.autoPaymentEnabled !== undefined ||
      body.reclubGroupId !== undefined;

    if (hasSettingsPayload) {
      const venue = await prisma.venue.findUnique({
        where: { id: venueId },
        select: { settings: true },
      });
      const current = (venue?.settings ?? {}) as Record<string, unknown>;
      venueUpdate.settings = {
        ...current,
        ...(body.autoApprovalPhone !== undefined
          ? { autoApprovalPhone: body.autoApprovalPhone.trim() || null }
          : {}),
        ...(body.autoApprovalCCCD !== undefined
          ? { autoApprovalCCCD: body.autoApprovalCCCD.trim() || null }
          : {}),
        ...(body.sepayEnabled !== undefined ? { sepayEnabled: body.sepayEnabled } : {}),
        ...(body.autoPaymentEnabled !== undefined
          ? { autoPaymentEnabled: body.autoPaymentEnabled }
          : {}),
        ...(body.reclubGroupId !== undefined
          ? { reclubGroupId: body.reclubGroupId ?? null }
          : {}),
      };
    }

    if (Object.keys(venueUpdate).length > 0) {
      await prisma.venue.update({ where: { id: venueId }, data: venueUpdate });
    }

    return json({ success: true });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
