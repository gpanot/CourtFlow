import { NextRequest } from "next/server";
import { json, error } from "@/lib/api-helpers";
import { prisma } from "@/lib/db";
import { resolveVenueId } from "@/lib/venue-config";
import { getBookingConfig } from "@/lib/booking";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const venueId = resolveVenueId(request);

    const venue = await prisma.venue.findUniqueOrThrow({
      where: { id: venueId },
      select: {
        id: true,
        name: true,
        slug: true,
        location: true,
        logoUrl: true,
        settings: true,
        bankName: true,
        bankAccount: true,
        bankOwnerName: true,
        contactPhone: true,
      },
    });

    const config = getBookingConfig(venue.settings as Record<string, unknown>);
    const vs = (venue.settings ?? {}) as Record<string, unknown>;

    return json({
      id: venue.id,
      name: venue.name,
      slug: venue.slug,
      location: venue.location,
      logoUrl: venue.logoUrl,
      contactPhone: venue.contactPhone,
      bookingConfig: {
        slotDurationMinutes: config.slotDurationMinutes,
        bookingStartHour: config.bookingStartHour,
        bookingEndHour: config.bookingEndHour,
        cancellationHours: config.cancellationHours,
        pricingRules: config.pricingRules,
        defaultPriceInCents: config.defaultPriceInCents,
      },
      bankName: venue.bankName,
      bankAccount: venue.bankAccount,
      bankOwnerName: venue.bankOwnerName,
      hasBankDetails: !!(venue.bankName && venue.bankAccount),
      settings: {
        autoPaymentEnabled: !!vs.autoPaymentEnabled,
        sepayEnabled: !!vs.sepayEnabled,
      },
    });
  } catch (e) {
    return error((e as Error).message, 500);
  }
}
