import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdminAccess } from "@/lib/auth";
import type { InvoiceData } from "@/components/pdf/InvoicePDF";
import {
  invoicePdfResponse,
  loadBookingInvoiceData,
  renderInvoicePdfBuffer,
  VENUE_WITH_ORG_SELECT,
} from "@/lib/invoice-pdf-data";

export const dynamic = "force-dynamic";

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
      const bookingData = await loadBookingInvoiceData(id);
      if (!bookingData) {
        return new Response("Invoice not yet generated for this booking", {
          status: 404,
        });
      }
      data = bookingData;
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

    const buffer = await renderInvoicePdfBuffer(data);
    return invoicePdfResponse(buffer, `${data.invoiceNumber}.pdf`);
  } catch (e) {
    console.error("[invoice-pdf]", e);
    return new Response((e as Error).message, { status: 500 });
  }
}
