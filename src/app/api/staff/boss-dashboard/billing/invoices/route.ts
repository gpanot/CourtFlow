import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const staff = requireStaff(req.headers);
    const { searchParams } = new URL(req.url);
    const venueId = searchParams.get("venueId") || staff.venueId;

    if (!venueId) {
      return NextResponse.json({ error: "venueId required" }, { status: 400 });
    }

    const invoices = await prisma.billingInvoice.findMany({
      where: { venueId },
      orderBy: { weekStartDate: "desc" },
      select: {
        id: true,
        weekStartDate: true,
        weekEndDate: true,
        totalCheckins: true,
        totalAmount: true,
        status: true,
        paymentRef: true,
        paidAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ invoices });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
