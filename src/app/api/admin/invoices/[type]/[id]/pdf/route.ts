import { NextRequest } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import React from "react";
import { prisma } from "@/lib/db";
import { requireAdminAccess } from "@/lib/auth";
import { InvoicePDF, type InvoiceData } from "@/components/pdf/InvoicePDF";

export const dynamic = "force-dynamic";

const VENUE_WITH_ORG_SELECT = {
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  try {
    await requireAdminAccess(request.headers);

    const { type, id } = await params;

    if (!["booking", "openplay", "lesson"].includes(type)) {
      return new Response("Invalid invoice type", { status: 400 });
    }

    let data: InvoiceData;

    if (type === "booking") {
      const booking = await prisma.booking.findUnique({
        where: { id },
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

      if (!booking) return new Response("Booking not found", { status: 404 });

      const invoiceNumber =
        booking.invoiceNumber ?? booking.bookingGroup?.invoiceNumber;
      const invoicedAt =
        booking.invoicedAt ?? booking.bookingGroup?.invoicedAt;
      const paymentRef =
        booking.paymentRef ?? booking.bookingGroup?.paymentRef;

      if (!invoiceNumber || !invoicedAt) {
        return new Response("Invoice not yet generated for this booking", {
          status: 404,
        });
      }

      data = {
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
    } else if (type === "openplay") {
      const reg = await prisma.openPlayRegistration.findUnique({
        where: { id },
        include: {
          player: { select: { name: true, phone: true } },
          venue: { select: VENUE_WITH_ORG_SELECT },
        },
      });

      if (!reg) return new Response("Registration not found", { status: 404 });
      if (!reg.invoiceNumber || !reg.invoicedAt) {
        return new Response("Invoice not yet generated for this registration", {
          status: 404,
        });
      }

      data = {
        invoiceNumber: reg.invoiceNumber,
        invoicedAt: reg.invoicedAt.toISOString(),
        type: "openplay",
        description: "Open Play Session",
        date: reg.date.toISOString(),
        startTime: reg.startTime.toISOString(),
        endTime: reg.endTime.toISOString(),
        quantity: 1,
        priceValue: reg.priceValue,
        playerName: reg.player.name,
        playerPhone: reg.player.phone,
        paymentMethod: reg.paymentMethod,
        paymentRef: reg.paymentRef,
        venueName: reg.venue.name,
        venueLocation: reg.venue.location,
        venueLogoUrl: reg.venue.logoUrl,
        venueBankAccount: reg.venue.bankAccount,
        venueBankName: reg.venue.bankName,
        venueBankOwnerName: reg.venue.bankOwnerName,
        venuePhone: reg.venue.contactPhone,
        ...orgLegalFields(reg.venue),
      };
    } else {
      // lesson
      const lesson = await prisma.coachLesson.findUnique({
        where: { id },
        include: {
          coach: { select: { name: true } },
          player: { select: { name: true, phone: true } },
          package: { select: { name: true, lessonType: true } },
          court: { select: { label: true } },
          venue: { select: VENUE_WITH_ORG_SELECT },
        },
      });

      if (!lesson) return new Response("Lesson not found", { status: 404 });
      if (!lesson.invoiceNumber || !lesson.invoicedAt) {
        return new Response("Invoice not yet generated for this lesson", {
          status: 404,
        });
      }

      const lessonTypeLabel =
        lesson.package.lessonType === "group" ? "Group" : "1-1";
      const courtPart = lesson.court ? ` · ${lesson.court.label}` : "";
      const description = `${lessonTypeLabel} Coaching – ${lesson.coach.name} · ${lesson.package.name}${courtPart}`;

      data = {
        invoiceNumber: lesson.invoiceNumber,
        invoicedAt: lesson.invoicedAt.toISOString(),
        type: "lesson",
        description,
        date: lesson.date.toISOString(),
        startTime: lesson.startTime.toISOString(),
        endTime: lesson.endTime.toISOString(),
        quantity: lesson.playerCount ?? 1,
        priceValue: lesson.priceValue,
        playerName: lesson.player.name,
        playerPhone: lesson.player.phone,
        paymentMethod: lesson.paymentMethod,
        paymentRef: lesson.paymentRef,
        venueName: lesson.venue.name,
        venueLocation: lesson.venue.location,
        venueLogoUrl: lesson.venue.logoUrl,
        venueBankAccount: lesson.venue.bankAccount,
        venueBankName: lesson.venue.bankName,
        venueBankOwnerName: lesson.venue.bankOwnerName,
        venuePhone: lesson.venue.contactPhone,
        ...orgLegalFields(lesson.venue),
      };
    }

    const filename = `${data.invoiceNumber}.pdf`;

    // renderToStream requires a Document element as root — render via InvoicePDF
    // which already wraps content in <Document>
    const element = React.createElement(InvoicePDF, { data });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = await renderToStream(element as any);

    const chunks: Uint8Array[] = [];
    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const buffer = Buffer.concat(chunks);

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
    console.error("[invoice-pdf]", e);
    return new Response((e as Error).message, { status: 500 });
  }
}
