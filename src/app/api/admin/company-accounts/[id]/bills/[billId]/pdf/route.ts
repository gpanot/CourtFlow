import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminAccess } from "@/lib/auth";
import { getOpenBillLineItems } from "@/lib/open-bill";
import { renderToStream } from "@react-pdf/renderer";
import { OpenBillStatementPDF, type OpenBillStatementData } from "@/components/pdf/OpenBillStatementPDF";
import React from "react";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; billId: string }> }
) {
  try {
    await requireAdminAccess(request.headers);
    const { billId } = await params;

    const bill = await prisma.companyOpenBill.findUnique({
      where: { id: billId },
      include: {
        companyAccount: true,
        venue: {
          select: {
            name: true,
            location: true,
            logoUrl: true,
            bankName: true,
            bankAccount: true,
            bankOwnerName: true,
            contactPhone: true,
            organization: {
              select: {
                legalCompanyName: true,
                registrationNumber: true,
                taxId: true,
                registeredAddress: true,
              },
            },
          },
        },
      },
    });

    if (!bill) return new Response("Bill not found", { status: 404 });

    const lineItems = await getOpenBillLineItems(billId);

    const data: OpenBillStatementData = {
      invoiceNumber: bill.invoiceNumber ?? `DRAFT-${billId.slice(-6).toUpperCase()}`,
      issuedAt: bill.issuedAt?.toISOString() ?? new Date().toISOString(),
      dueDate: bill.dueDate?.toISOString() ?? null,
      periodStart: bill.periodStart.toISOString(),
      periodEnd: bill.periodEnd?.toISOString() ?? null,
      status: bill.status,
      companyName: bill.companyAccount.name,
      billingEmail: bill.companyAccount.billingEmail,
      taxId: bill.companyAccount.taxId,
      billingAddress: bill.companyAccount.billingAddress,
      contactPhone: bill.companyAccount.contactPhone,
      isSolo: bill.companyAccount.isSolo,
      subtotal: bill.subtotal,
      discountAmount: bill.discountAmount,
      taxableBase: bill.taxableBase,
      vatAmount: bill.vatAmount,
      vatPercent: bill.vatPercent,
      priceVatMode: bill.priceVatMode,
      totalAmount: bill.totalAmount,
      paymentRef: bill.paymentRef,
      paidMethod: bill.paidMethod,
      lineItems: lineItems.map((li) => ({
        bookingId: li.bookingId,
        date: li.date.toISOString(),
        courtLabel: li.courtLabel,
        startTime: li.startTime.toISOString(),
        endTime: li.endTime.toISOString(),
        priceValue: li.priceValue,
        isCancelled: li.isCancelled,
        bookerName: li.bookerName,
      })),
      venueName: bill.venue.name,
      venueLocation: bill.venue.location,
      venueLogoUrl: bill.venue.logoUrl,
      venueBankName: bill.venue.bankName,
      venueBankAccount: bill.venue.bankAccount,
      venueBankOwnerName: bill.venue.bankOwnerName,
      venuePhone: bill.venue.contactPhone,
      legalCompanyName: bill.venue.organization?.legalCompanyName ?? null,
      registrationNumber: bill.venue.organization?.registrationNumber ?? null,
      orgTaxId: bill.venue.organization?.taxId ?? null,
      registeredAddress: bill.venue.organization?.registeredAddress ?? null,
    };

    const element = React.createElement(OpenBillStatementPDF, { data });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const buffer = Buffer.concat(chunks);

    const filename = `statement-${data.invoiceNumber}.pdf`;

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": buffer.length.toString(),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("access required") || msg.includes("token")) {
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response(msg, { status: 500 });
  }
}
