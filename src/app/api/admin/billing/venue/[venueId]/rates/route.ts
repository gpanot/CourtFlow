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
    if (billingModel !== undefined && billingModel !== "per_payment" && billingModel !== "monthly") {
      return NextResponse.json(
        { error: "billingModel must be 'per_payment' or 'monthly'" },
        { status: 400 }
      );
    }

    // When switching to monthly for the first time, record the period start date
    // so the cron can pro-rate the first invoice.
    let monthlyPeriodStart: Date | undefined | null = undefined;
    if (billingModel === "monthly" && body.monthlyPeriodStart !== undefined) {
      monthlyPeriodStart = body.monthlyPeriodStart ? new Date(body.monthlyPeriodStart) : null;
    } else if (billingModel === "monthly") {
      // Auto-set to today if switching to monthly and no explicit date provided
      const existing = await prisma.venueBillingRate.findUnique({ where: { venueId } });
      if (!existing || existing.billingModel !== "monthly") {
        // First activation — use today as period start
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        monthlyPeriodStart = today;
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
      },
    });

    return NextResponse.json(rates);
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
