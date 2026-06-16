import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId } = await params;
    const body = await req.json();

    const billingModel = body.billingModel;
    if (
      billingModel !== undefined &&
      billingModel !== "per_payment" &&
      billingModel !== "monthly" &&
      billingModel !== "manual"
    ) {
      return NextResponse.json(
        { error: "billingModel must be 'per_payment', 'monthly', or 'manual'" },
        { status: 400 }
      );
    }

    // When switching to monthly for the first time, record the period start date
    let monthlyPeriodStart: Date | undefined | null = undefined;
    if (billingModel === "monthly" && body.monthlyPeriodStart !== undefined) {
      monthlyPeriodStart = body.monthlyPeriodStart ? new Date(body.monthlyPeriodStart) : null;
    } else if (billingModel === "monthly") {
      const existing = await prisma.venueBillingRate.findUnique({ where: { venueId } });
      if (!existing || existing.billingModel !== "monthly") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        monthlyPeriodStart = today;
      }
    }

    // Monthly end date: null means no expiry
    let monthlyEndDate: Date | null | undefined = undefined;
    if (body.monthlyEndDate !== undefined) {
      monthlyEndDate = body.monthlyEndDate ? new Date(body.monthlyEndDate) : null;
    }

    // Monthly status: auto-set to "active" when switching to monthly
    let monthlyStatus: string | undefined = undefined;
    if (body.monthlyStatus !== undefined) {
      monthlyStatus = body.monthlyStatus;
    } else if (billingModel === "monthly") {
      const existing = await prisma.venueBillingRate.findUnique({ where: { venueId } });
      if (!existing || existing.billingModel !== "monthly") {
        monthlyStatus = "active";
      }
    }

    const rates = await prisma.venueBillingRate.upsert({
      where: { venueId },
      create: {
        venueId,
        baseRatePerCheckin: body.baseRatePerCheckin ?? 5000,
        subscriptionAddon: body.subscriptionAddon ?? 1000,
        sepayAddon: body.sepayAddon ?? 1000,
        isFreeBase: body.isFreeBase ?? false,
        isFreeSubAddon: body.isFreeSubAddon ?? false,
        isFreeSepayAddon: body.isFreeSepayAddon ?? false,
        billingModel: billingModel ?? "per_payment",
        monthlyRate: body.monthlyRate ?? 0,
        monthlyPeriodStart: monthlyPeriodStart ?? undefined,
        monthlyEndDate: monthlyEndDate ?? undefined,
        monthlyStatus: monthlyStatus ?? "inactive",
      },
      update: {
        ...(body.baseRatePerCheckin !== undefined && { baseRatePerCheckin: body.baseRatePerCheckin }),
        ...(body.subscriptionAddon !== undefined && { subscriptionAddon: body.subscriptionAddon }),
        ...(body.sepayAddon !== undefined && { sepayAddon: body.sepayAddon }),
        ...(body.isFreeBase !== undefined && { isFreeBase: body.isFreeBase }),
        ...(body.isFreeSubAddon !== undefined && { isFreeSubAddon: body.isFreeSubAddon }),
        ...(body.isFreeSepayAddon !== undefined && { isFreeSepayAddon: body.isFreeSepayAddon }),
        ...(billingModel !== undefined && { billingModel }),
        ...(body.monthlyRate !== undefined && { monthlyRate: body.monthlyRate }),
        ...(monthlyPeriodStart !== undefined && { monthlyPeriodStart }),
        ...(monthlyEndDate !== undefined && { monthlyEndDate }),
        ...(monthlyStatus !== undefined && { monthlyStatus }),
      },
    });

    return NextResponse.json(rates);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * PATCH /api/admin/billing/venue/[venueId]/rates
 * Quick actions: cancel or reactivate monthly subscription, update amount.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId } = await params;
    const body = await req.json();
    const action = body.action as string | undefined;

    const existing = await prisma.venueBillingRate.findUnique({ where: { venueId } });
    if (!existing) {
      return NextResponse.json({ error: "No billing rates configured for this venue" }, { status: 404 });
    }

    if (action === "cancel") {
      const rates = await prisma.venueBillingRate.update({
        where: { venueId },
        data: { monthlyStatus: "cancelled" },
      });
      return NextResponse.json(rates);
    }

    if (action === "reactivate") {
      const rates = await prisma.venueBillingRate.update({
        where: { venueId },
        data: { monthlyStatus: "active" },
      });
      return NextResponse.json(rates);
    }

    if (action === "update_amount" && body.monthlyRate !== undefined) {
      const rates = await prisma.venueBillingRate.update({
        where: { venueId },
        data: { monthlyRate: body.monthlyRate },
      });
      return NextResponse.json(rates);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId } = await params;

    await prisma.venueBillingRate.deleteMany({
      where: { venueId },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
