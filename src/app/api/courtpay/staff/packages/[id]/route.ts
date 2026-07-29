import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireStaff(req.headers);
    const { id } = await params;
    const body = await req.json();

    // Build fixedStartDate / fixedEndDate at noon local time to avoid timezone date shift
    const fixedStartPrisma =
      body.fixedStartDate !== undefined
        ? body.fixedStartDate
          ? new Date(`${body.fixedStartDate}T12:00:00+07:00`)
          : null
        : undefined;
    const fixedEndPrisma =
      body.fixedEndDate !== undefined
        ? body.fixedEndDate
          ? new Date(`${body.fixedEndDate}T12:00:00+07:00`)
          : null
        : undefined;

    const pkg = await prisma.subscriptionPackage.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.sessions !== undefined && { sessions: body.sessions }),
        ...(body.durationDays !== undefined && { durationDays: body.durationDays }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.perks !== undefined && { perks: body.perks?.trim() || null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.discountPct !== undefined && { discountPct: body.discountPct }),
        ...(body.isBestChoice !== undefined && { isBestChoice: body.isBestChoice }),
        ...(body.showInCheckIn !== undefined && { showInCheckIn: body.showInCheckIn }),
        ...(body.isFreePass !== undefined && { isFreePass: body.isFreePass }),
        ...(body.validDays !== undefined && { validDays: body.validDays ?? null }),
        ...(body.timeStart !== undefined && { timeStart: body.timeStart ?? null }),
        ...(body.timeEnd !== undefined && { timeEnd: body.timeEnd ?? null }),
        ...(fixedStartPrisma !== undefined && { fixedStartDate: fixedStartPrisma }),
        ...(fixedEndPrisma !== undefined && { fixedEndDate: fixedEndPrisma }),
        ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
      },
    });

    return NextResponse.json({ package: pkg });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireStaff(req.headers);
    const { id } = await params;

    await prisma.subscriptionPackage.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
