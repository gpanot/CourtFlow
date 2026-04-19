import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { buildVietQRUrl } from "@/lib/vietqr";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    requireStaff(req.headers);
    const { invoiceId } = await params;

    const invoice = await prisma.billingInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const config = await prisma.billingConfig.findUnique({
      where: { id: "default" },
    });

    if (!config || !config.bankBin || !config.bankAccount) {
      return NextResponse.json(
        { error: "Billing bank details not configured. Contact admin." },
        { status: 503 }
      );
    }

    const qrUrl = buildVietQRUrl({
      bankBin: config.bankBin,
      accountNumber: config.bankAccount,
      accountName: config.bankOwner,
      amount: invoice.totalAmount,
      description: invoice.paymentRef ?? "",
    });

    return NextResponse.json({
      qrUrl,
      amount: invoice.totalAmount,
      reference: invoice.paymentRef,
      status: invoice.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    const status = message.includes("access") || message.includes("token") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
