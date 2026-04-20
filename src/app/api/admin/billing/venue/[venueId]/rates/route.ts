import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ venueId: string }> }
) {
  try {
    requireSuperAdmin(req.headers);
    const { venueId } = await params;
    const body = await req.json();

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
      },
      update: {
        ...(body.baseRatePerCheckin !== undefined && { baseRatePerCheckin: body.baseRatePerCheckin }),
        ...(body.subscriptionAddon !== undefined && { subscriptionAddon: body.subscriptionAddon }),
        ...(body.sepayAddon !== undefined && { sepayAddon: body.sepayAddon }),
        ...(body.isFreeBase !== undefined && { isFreeBase: body.isFreeBase }),
        ...(body.isFreeSubAddon !== undefined && { isFreeSubAddon: body.isFreeSubAddon }),
        ...(body.isFreeSepayAddon !== undefined && { isFreeSepayAddon: body.isFreeSepayAddon }),
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
