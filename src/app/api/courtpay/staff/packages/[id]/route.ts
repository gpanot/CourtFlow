import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    requireStaff(req.headers);
    const { id } = await params;
    const body = await req.json();

    const pkg = await prisma.subscriptionPackage.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.sessions !== undefined && { sessions: body.sessions }),
        ...(body.durationDays !== undefined && { durationDays: body.durationDays }),
        ...(body.price !== undefined && { price: body.price }),
        ...(body.perks !== undefined && { perks: body.perks?.trim() || null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
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
