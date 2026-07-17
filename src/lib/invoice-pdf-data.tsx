import { renderToStream } from "@react-pdf/renderer";
import React from "react";
import { prisma } from "./db";
import { InvoicePDF, type InvoiceData } from "@/components/pdf/InvoicePDF";

export const VENUE_WITH_ORG_SELECT = {
  name: true,
  location: true,
  logoUrl: true,
  bankAccount: true,
  bankName: true,
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
} as const;

function orgLegalFields(
  venue: {
    organization: {
      legalCompanyName: string | null;
      registrationNumber: string | null;
      taxId: string | null;
      registeredAddress: string | null;
    } | null;
  }
) {
  return {
    legalCompanyName: venue.organization?.legalCompanyName ?? null,
    registrationNumber: venue.organization?.registrationNumber ?? null,
    taxId: venue.organization?.taxId ?? null,
    registeredAddress: venue.organization?.registeredAddress ?? null,
  };
}

export async function loadBookingInvoiceData(bookingId: string): Promise<InvoiceData | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      court: { select: { label: true } },
      player: { select: { name: true, phone: true } },
      bookingGroup: {
        select: {
          paymentRef: true,
          invoiceNumber: true,
          invoicedAt: true,
        },
      },
      venue: { select: VENUE_WITH_ORG_SELECT },
    },
  });

  if (!booking) return null;

  const invoiceNumber = booking.invoiceNumber ?? booking.bookingGroup?.invoiceNumber;
  const invoicedAt = booking.invoicedAt ?? booking.bookingGroup?.invoicedAt;
  const paymentRef = booking.paymentRef ?? booking.bookingGroup?.paymentRef;

  if (!invoiceNumber || !invoicedAt) return null;

  return {
    invoiceNumber,
    invoicedAt: invoicedAt.toISOString(),
    type: "booking",
    description: `Court Booking – ${booking.court.label}`,
    date: booking.date.toISOString(),
    startTime: booking.startTime.toISOString(),
    endTime: booking.endTime.toISOString(),
    quantity: 1,
    priceValue: booking.priceValue,
    playerName: booking.player.name,
    playerPhone: booking.player.phone,
    paymentMethod: booking.paymentMethod,
    paymentRef: paymentRef ?? null,
    venueName: booking.venue.name,
    venueLocation: booking.venue.location,
    venueLogoUrl: booking.venue.logoUrl,
    venueBankAccount: booking.venue.bankAccount,
    venueBankName: booking.venue.bankName,
    venueBankOwnerName: booking.venue.bankOwnerName,
    venuePhone: booking.venue.contactPhone,
    ...orgLegalFields(booking.venue),
  };
}

export async function loadProgramPassInvoiceData(paymentId: string): Promise<InvoiceData | null> {
  const payment = await prisma.programPassPayment.findUnique({
    where: { id: paymentId },
    include: {
      programPass: {
        include: {
          player: { select: { name: true, phone: true } },
          passType: { select: { name: true } },
          programRun: { select: { name: true } },
          venue: { select: VENUE_WITH_ORG_SELECT },
        },
      },
    },
  });

  if (!payment) return null;
  if (!payment.invoiceNumber || !payment.invoicedAt) return null;

  const pass = payment.programPass;
  const description = `Program – ${pass.passType.name}${pass.programRun ? ` · ${pass.programRun.name}` : ""}`;

  return {
    invoiceNumber: payment.invoiceNumber,
    invoicedAt: payment.invoicedAt.toISOString(),
    type: "lesson",
    description,
    date: payment.periodStart.toISOString(),
    startTime: payment.periodStart.toISOString(),
    endTime: payment.periodEnd.toISOString(),
    quantity: 1,
    priceValue: payment.amountValue,
    playerName: pass.player.name,
    playerPhone: pass.player.phone,
    paymentMethod: payment.paymentMethod,
    paymentRef: payment.paymentRef ?? null,
    venueName: pass.venue.name,
    venueLocation: pass.venue.location,
    venueLogoUrl: pass.venue.logoUrl,
    venueBankAccount: pass.venue.bankAccount,
    venueBankName: pass.venue.bankName,
    venueBankOwnerName: pass.venue.bankOwnerName,
    venuePhone: pass.venue.contactPhone,
    ...orgLegalFields(pass.venue),
  };
}

export async function renderInvoicePdfBuffer(data: InvoiceData): Promise<Buffer> {
  const element = React.createElement(InvoicePDF, { data });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream = await renderToStream(element as any);

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export function invoicePdfResponse(buffer: Buffer, filename: string): Response {
  const body = new Uint8Array(buffer);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length.toString(),
      "Cache-Control": "no-store",
    },
  });
}
